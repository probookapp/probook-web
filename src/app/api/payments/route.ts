import { NextResponse } from "next/server";
import { withAuth, toSnakeCase, parseListPagination, nextCursorOf } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { validateBody, isValidationError } from "@/lib/validate";
import { paymentSchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";
import { num } from "@/lib/money";

const EPSILON = 0.01;

/** Business-rule failure inside the payment transaction → mapped to an HTTP error. */
class PaymentError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export const GET = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "invoices", "view");
  if (denied) return denied;

  // Opt-in cursor pagination (audit SALE-23): lean rows — scalars + the
  // invoice reference (id/number/client), not the full invoice row.
  const page = parseListPagination(req);
  if (page) {
    const cursorId = page.cursor
      ? (await prisma.payment.findFirst({
          where: { tenantId, id: page.cursor },
          select: { id: true },
        }))?.id ?? null
      : null;
    const data = await prisma.payment.findMany({
      where: { tenantId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: page.limit,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      include: {
        invoice: { select: { id: true, invoiceNumber: true, clientId: true } },
      },
    });
    return NextResponse.json(
      toSnakeCase({ data, nextCursor: nextCursorOf(data, page.limit) })
    );
  }

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

  const idempotencyKey = body.idempotency_key || null;

  // Replay of an already-recorded payment (offline queue / double submit)
  // → return it as-is instead of double-crediting the invoice.
  if (idempotencyKey) {
    const existing = await prisma.payment.findFirst({
      where: { tenantId, idempotencyKey },
    });
    if (existing) return NextResponse.json(toSnakeCase(existing));
  }

  try {
    // Invoice lookup, overpay guard, payment create and status flip happen in
    // ONE transaction (audit SALE-6/7/9): a payment can no longer attach to
    // another tenant's invoice, overpay it, or leave the status stale.
    const payment = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { tenantId, id: body.invoice_id },
        include: { payments: true },
      });
      if (!invoice) throw new PaymentError("Invoice not found", 404);

      // Amount owed includes the stamp duty (droit de timbre) snapshot.
      const amountOwed = num(invoice.total) + num(invoice.stampDuty);
      const paidSoFar = invoice.payments.reduce((sum, p) => sum + num(p.amount), 0);
      if (paidSoFar + body.amount > amountOwed + EPSILON) {
        throw new PaymentError("Payment exceeds the remaining amount owed on this invoice", 400);
      }

      const created = await tx.payment.create({
        data: {
          tenantId,
          invoiceId: invoice.id,
          amount: body.amount,
          paymentDate: new Date(body.payment_date),
          paymentMethod: body.payment_method,
          reference: body.reference || null,
          notes: body.notes || null,
          idempotencyKey,
        },
      });

      if (paidSoFar + body.amount >= amountOwed - EPSILON && invoice.status !== "PAID") {
        await tx.invoice.update({
          where: { tenantId, id: invoice.id },
          data: { status: "PAID" },
        });
      }

      return created;
    });

    return NextResponse.json(toSnakeCase(payment));
  } catch (err) {
    if (err instanceof PaymentError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    // A concurrent request may have committed this exact payment (same
    // idempotency key) between our pre-check and the create — return it.
    if (isUniqueViolation(err) && idempotencyKey) {
      const existing = await prisma.payment.findFirst({
        where: { tenantId, idempotencyKey },
      });
      if (existing) return NextResponse.json(toSnakeCase(existing));
    }
    throw err;
  }
});
