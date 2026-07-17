import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { paymentSchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";

export const GET = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "invoices", "view");
  if (denied) return denied;
  const payments = await prisma.payment.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: { invoice: true },
  });
  return NextResponse.json(toSnakeCase(payments));
});

export const POST = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "invoices", "edit");
  if (denied) return denied;
  const body = await validateBody(req, paymentSchema);
  if (isValidationError(body)) return body;
  const payment = await prisma.payment.create({
    data: {
      tenantId,
      invoiceId: body.invoice_id,
      amount: body.amount,
      paymentDate: new Date(body.payment_date),
      paymentMethod: body.payment_method,
      reference: body.reference || null,
      notes: body.notes || null,
    },
  });

  // Check if invoice is fully paid and update status
  const invoice = await prisma.invoice.findFirst({
    where: { tenantId, id: body.invoice_id },
    include: { payments: true },
  });
  if (invoice) {
    const totalPaid = invoice.payments.reduce((sum, p) => sum + p.amount, 0);
    // Amount owed includes the stamp duty (droit de timbre) snapshot.
    const amountOwed = invoice.total + (invoice.stampDuty ?? 0);
    if (totalPaid >= amountOwed) {
      await prisma.invoice.update({
        where: { tenantId, id: invoice.id },
        data: { status: "PAID" },
      });
    }
  }

  return NextResponse.json(toSnakeCase(payment));
});
