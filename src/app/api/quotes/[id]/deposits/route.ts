import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { validateBody, isValidationError } from "@/lib/validate";
import { quoteDepositSchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";
import { num } from "@/lib/money";
import { stampDutyApplies } from "@/lib/stamp-duty";
import { missingChequeMentions } from "@/lib/cheque-mentions";
import { journalInvoicePayment } from "@/lib/pos-journal";

const EPSILON = 0.01;

class DepositError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/**
 * Deposits a client pays on a quote before it becomes an invoice: real money,
 * dated and with its method, so the cash journal sees it the day it arrives
 * and the invoice later counts it (src/lib/quote-deposits.ts).
 *
 * The quote's own "down payment" figure is only what is asked for, printed on
 * the document; these are what was actually received.
 */
export const GET = withAuth(async (req, { tenantId, session, params }) => {
  const denied = await requirePermission(session, "quotes", "view");
  if (denied) return denied;
  const deposits = await prisma.payment.findMany({
    where: { tenantId, quoteId: params?.id },
    orderBy: { paymentDate: "asc" },
  });
  return NextResponse.json(toSnakeCase(deposits));
});

export const POST = withAuth(async (req, { tenantId, session, params }) => {
  const denied = await requirePermission(session, "quotes", "edit");
  if (denied) return denied;
  const body = await validateBody(req, quoteDepositSchema);
  if (isValidationError(body)) return body;

  // Same article 258 rule as a payment on an invoice: a cheque has to carry
  // its date, number and drawee wherever the droit de timbre can arise.
  const settings = await prisma.companySettings.findFirst({
    where: { tenantId },
    select: { fiscalProfile: true, stampDutyEnabled: true },
  });
  if (settings && stampDutyApplies(settings)) {
    const missing = missingChequeMentions(body.payment_method, body);
    if (missing.length) {
      return NextResponse.json(
        {
          error: `A cheque needs its date, number and drawee bank (Code du timbre, art. 258). Missing: ${missing.join(", ")}.`,
          code: "CHEQUE_MENTIONS_REQUIRED",
          missing,
        },
        { status: 400 }
      );
    }
  }

  const idempotencyKey = body.idempotency_key || null;
  if (idempotencyKey) {
    const existing = await prisma.payment.findFirst({ where: { tenantId, idempotencyKey } });
    if (existing) return NextResponse.json(toSnakeCase(existing));
  }

  try {
    const deposit = await prisma.$transaction(async (tx) => {
      // Serialize deposits on one quote, so two cannot both pass the cap.
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "quotes"
        WHERE "id" = ${params?.id} AND "tenant_id" = ${tenantId}
        FOR UPDATE`;
      if (locked.length === 0) throw new DepositError("Quote not found", 404);

      const quote = await tx.quote.findFirstOrThrow({
        where: { tenantId, id: params?.id },
        include: { deposits: true, invoices: { select: { id: true }, take: 1 } },
      });
      // Once invoiced, money goes on the invoice, where the balance is kept.
      if (quote.invoices.length > 0) {
        throw new DepositError("This quote is already invoiced: record the payment on the invoice", 409);
      }
      if (quote.status === "REFUSED") {
        throw new DepositError("A refused quote cannot take a deposit", 400);
      }
      const already = quote.deposits.reduce((sum, p) => sum + num(p.amount), 0);
      if (already + body.amount > num(quote.total) + EPSILON) {
        throw new DepositError("Deposits exceed the quote total", 400);
      }

      const created = await tx.payment.create({
        data: {
          tenantId,
          quoteId: quote.id,
          amount: body.amount,
          paymentDate: new Date(body.payment_date),
          paymentMethod: body.payment_method,
          reference: body.reference || null,
          chequeDate: body.cheque_date ? new Date(body.cheque_date) : null,
          chequeNumber: body.cheque_number || null,
          chequeBank: body.cheque_bank || null,
          notes: body.notes || null,
          idempotencyKey,
        },
      });
      // Money collected is journaled when it is collected, invoice or not.
      await journalInvoicePayment(tx, { tenantId, userId: session.userId, kind: "PAYMENT", payment: created });
      return created;
    });
    return NextResponse.json(toSnakeCase(deposit));
  } catch (err) {
    if (err instanceof DepositError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && idempotencyKey) {
      const existing = await prisma.payment.findFirst({ where: { tenantId, idempotencyKey } });
      if (existing) return NextResponse.json(toSnakeCase(existing));
    }
    throw err;
  }
});
