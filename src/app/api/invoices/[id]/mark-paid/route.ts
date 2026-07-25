import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions-server";
import { invoiceMarkPaidSchema } from "@/lib/validations";
import { num } from "@/lib/money";

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
    const amountOwed = num(invoice.total) + num(invoice.stampDuty);
    const paidSoFar = invoice.payments.reduce((sum, p) => sum + num(p.amount), 0);
    const remaining = Math.round((amountOwed - paidSoFar) * 100) / 100;

    // Atomically claim the PAID transition. Two concurrent calls (double-click,
    // offline replay) both computed `remaining` from the same unlocked read;
    // only the one that actually flips the status (count === 1) may top up, so
    // the balance can never be recorded twice.
    const flipped = await tx.invoice.updateMany({
      where: { tenantId, id: invoice.id, status: { not: "PAID" } },
      data: { status: "PAID" },
    });

    if (flipped.count === 1 && remaining > EPSILON) {
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
    }

    return tx.invoice.findFirst({
      where: { tenantId, id: invoice.id },
      include: { lines: { orderBy: { position: "asc" } }, client: true, payments: true },
    });
  });

  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(toSnakeCase(result));
});
