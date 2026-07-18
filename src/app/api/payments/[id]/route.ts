import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { validateBody, isValidationError } from "@/lib/validate";
import { updatePaymentSchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";

const EPSILON = 0.01;

/** Business-rule failure inside the payment transaction → mapped to an HTTP error. */
class PaymentError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/**
 * Recompute the parent invoice's status from its payments (audit SALE-8).
 * Fully paid → PAID; no longer fully paid → demote a PAID invoice back to
 * ISSUED (the app's issued-unpaid status); other statuses are left alone.
 */
async function syncInvoiceStatus(
  tx: Prisma.TransactionClient,
  tenantId: string,
  invoiceId: string
) {
  const invoice = await tx.invoice.findFirst({
    where: { tenantId, id: invoiceId },
    include: { payments: true },
  });
  if (!invoice) return;

  const amountOwed = invoice.total + (invoice.stampDuty ?? 0);
  const totalPaid = invoice.payments.reduce((sum, p) => sum + p.amount, 0);

  if (totalPaid >= amountOwed - EPSILON) {
    if (invoice.status !== "PAID") {
      await tx.invoice.update({ where: { tenantId, id: invoiceId }, data: { status: "PAID" } });
    }
  } else if (invoice.status === "PAID") {
    await tx.invoice.update({ where: { tenantId, id: invoiceId }, data: { status: "ISSUED" } });
  }
}

export const GET = withAuth(async (req, { tenantId, session, params }) => {
  const denied = await requirePermission(session, "invoices", "view");
  if (denied) return denied;
  const payment = await prisma.payment.findFirst({
    where: { tenantId, id: params?.id },
    include: { invoice: true },
  });
  if (!payment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(toSnakeCase(payment));
});

export const PUT = withAuth(async (req, { tenantId, session, params }) => {
  const denied = await requirePermission(session, "invoices", "edit");
  if (denied) return denied;
  const body = await validateBody(req, updatePaymentSchema);
  if (isValidationError(body)) return body;

  const existing = await prisma.payment.findFirst({
    where: { tenantId, id: params?.id },
    select: { id: true, invoiceId: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const payment = await prisma.$transaction(async (tx) => {
      // Overpay guard: the edited amount plus the other payments must not
      // exceed what the invoice owes (audit SALE-7).
      const invoice = await tx.invoice.findFirst({
        where: { tenantId, id: existing.invoiceId },
        include: { payments: true },
      });
      if (invoice) {
        const amountOwed = invoice.total + (invoice.stampDuty ?? 0);
        const paidByOthers = invoice.payments
          .filter((p) => p.id !== existing.id)
          .reduce((sum, p) => sum + p.amount, 0);
        if (paidByOthers + body.amount > amountOwed + EPSILON) {
          throw new PaymentError("Payment exceeds the remaining amount owed on this invoice", 400);
        }
      }

      const updated = await tx.payment.update({
        where: { tenantId, id: params?.id },
        data: {
          amount: body.amount,
          paymentDate: new Date(body.payment_date),
          paymentMethod: body.payment_method,
          reference: body.reference || null,
          notes: body.notes || null,
        },
      });

      await syncInvoiceStatus(tx, tenantId, existing.invoiceId);
      return updated;
    });

    return NextResponse.json(toSnakeCase(payment));
  } catch (err) {
    if (err instanceof PaymentError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
});

export const DELETE = withAuth(async (req, { tenantId, session, params }) => {
  const denied = await requirePermission(session, "invoices", "delete");
  if (denied) return denied;

  const existing = await prisma.payment.findFirst({
    where: { tenantId, id: params?.id },
    select: { id: true, invoiceId: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.payment.delete({ where: { tenantId, id: params?.id } });
    // A deleted payment may un-pay the invoice — recompute its status (SALE-8).
    await syncInvoiceStatus(tx, tenantId, existing.invoiceId);
  });

  return new NextResponse(null, { status: 204 });
});
