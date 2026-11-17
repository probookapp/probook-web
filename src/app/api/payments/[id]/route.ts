import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { validateBody, isValidationError } from "@/lib/validate";
import { updatePaymentSchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";
import { num } from "@/lib/money";
import { journalInvoicePayment } from "@/lib/pos-journal";

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
  invoiceId: string | null
) {
  // A deposit still on its quote has no invoice status to keep in step.
  if (!invoiceId) return;
  const invoice = await tx.invoice.findFirst({
    where: { tenantId, id: invoiceId },
    include: { payments: true },
  });
  if (!invoice) return;

  const amountOwed = num(invoice.total) + num(invoice.stampDuty);
  const totalPaid = invoice.payments.reduce((sum, p) => sum + num(p.amount), 0);

  if (totalPaid >= amountOwed - EPSILON) {
    // A draft stays a draft: it is issuing that makes it PAID (see the issue route).
    if (invoice.status === "ISSUED") {
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

/**
 * A payment answers to its invoice's permissions; a deposit still waiting on
 * its quote answers to the quote's.
 */
function paymentModule(payment: { invoiceId: string | null }): "invoices" | "quotes" {
  return payment.invoiceId ? "invoices" : "quotes";
}

export const PUT = withAuth(async (req, { tenantId, session, params }) => {
  const existing = await prisma.payment.findFirst({
    where: { tenantId, id: params?.id },
    select: { id: true, invoiceId: true, quoteId: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const denied = await requirePermission(session, paymentModule(existing), "edit");
  if (denied) return denied;
  const body = await validateBody(req, updatePaymentSchema);
  if (isValidationError(body)) return body;

  try {
    const payment = await prisma.$transaction(async (tx) => {
      // A deposit cannot outgrow the quote it was taken on.
      if (!existing.invoiceId && existing.quoteId) {
        const quote = await tx.quote.findFirst({
          where: { tenantId, id: existing.quoteId },
          include: { deposits: true },
        });
        if (quote) {
          const others = quote.deposits
            .filter((p) => p.id !== existing.id)
            .reduce((sum, p) => sum + num(p.amount), 0);
          if (others + body.amount > num(quote.total) + EPSILON) {
            throw new PaymentError("Deposits exceed the quote total", 400);
          }
        }
      }

      // Overpay guard: the edited amount plus the other payments must not
      // exceed what the invoice owes (audit SALE-7).
      const invoice = existing.invoiceId
        ? await tx.invoice.findFirst({
            where: { tenantId, id: existing.invoiceId },
            include: { payments: true },
          })
        : null;
      if (invoice) {
        const amountOwed = num(invoice.total) + num(invoice.stampDuty);
        const paidByOthers = invoice.payments
          .filter((p) => p.id !== existing.id)
          .reduce((sum, p) => sum + num(p.amount), 0);
        if (paidByOthers + body.amount > amountOwed + EPSILON) {
          throw new PaymentError("Payment exceeds the remaining amount owed on this invoice", 400);
        }
      }

      // In the secured journal an edit is the old payment taken back and the
      // new one recorded, the original entry is never rewritten.
      const before = await tx.payment.findFirst({ where: { tenantId, id: existing.id } });
      if (before) {
        await journalInvoicePayment(tx, { tenantId, userId: session.userId, kind: "PAYMENT_REVERSAL", payment: before });
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

      await journalInvoicePayment(tx, { tenantId, userId: session.userId, kind: "PAYMENT", payment: updated });
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
  const existing = await prisma.payment.findFirst({
    where: { tenantId, id: params?.id },
    select: { id: true, invoiceId: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Taking back a deposit is editing the quote, which owns no delete of its own here.
  const denied = await requirePermission(
    session,
    paymentModule(existing),
    existing.invoiceId ? "delete" : "edit"
  );
  if (denied) return denied;

  await prisma.$transaction(async (tx) => {
    const deleted = await tx.payment.delete({ where: { tenantId, id: params?.id } });
    await journalInvoicePayment(tx, { tenantId, userId: session.userId, kind: "PAYMENT_REVERSAL", payment: deleted });
    // A deleted payment may un-pay the invoice — recompute its status (SALE-8).
    await syncInvoiceStatus(tx, tenantId, existing.invoiceId);
  });

  return new NextResponse(null, { status: 204 });
});
