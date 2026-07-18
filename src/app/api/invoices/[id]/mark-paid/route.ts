import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions-server";
import { invoiceMarkPaidSchema } from "@/lib/validations";

const EPSILON = 0.01;

export const POST = withAuth(async (req, { session, tenantId, params }) => {
  const denied = await requirePermission(session, "invoices", "edit");
  if (denied) return denied;

  // The UI sends this request without a body, so an empty/absent JSON payload
  // must stay valid — parse leniently, then validate whatever was sent.
  const raw = await req.json().catch(() => ({}));
  const parsed = invoiceMarkPaidSchema.safeParse(raw);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));
    return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 });
  }
  const body = parsed.data;

  // Read, top-up payment and status flip happen in ONE transaction so a
  // double-invocation (double-click, offline replay) cannot record the
  // remaining amount twice (audit SALE-9).
  const result = await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { tenantId, id: params?.id },
      include: { payments: true },
    });
    if (!invoice) return null;

    // The amount owed includes the stamp duty snapshot (droit de timbre).
    const amountOwed = invoice.total + (invoice.stampDuty ?? 0);
    const paidSoFar = invoice.payments.reduce((sum, p) => sum + p.amount, 0);
    const remaining = Math.round((amountOwed - paidSoFar) * 100) / 100;

    // Already settled → idempotent no-op (just make sure the status agrees).
    if (remaining <= EPSILON) {
      if (invoice.status === "PAID") {
        return tx.invoice.findFirst({
          where: { tenantId, id: invoice.id },
          include: { lines: { orderBy: { position: "asc" } }, client: true, payments: true },
        });
      }
      return tx.invoice.update({
        where: { tenantId, id: invoice.id },
        data: { status: "PAID" },
        include: { lines: { orderBy: { position: "asc" } }, client: true, payments: true },
      });
    }

    await tx.payment.create({
      data: {
        tenantId,
        invoiceId: invoice.id,
        amount: remaining,
        paymentDate: new Date(),
        paymentMethod: body?.payment_method || "other",
        reference: body?.reference || null,
        notes: body?.notes || null,
      },
    });

    return tx.invoice.update({
      where: { tenantId, id: invoice.id },
      data: { status: "PAID" },
      include: { lines: { orderBy: { position: "asc" } }, client: true, payments: true },
    });
  });

  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(toSnakeCase(result));
});
