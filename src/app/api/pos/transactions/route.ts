import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { applyStockChange } from "@/lib/stock";
import { validateBody, isValidationError } from "@/lib/validate";
import { posTransactionSchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";
import { Prisma } from "@/generated/prisma/client";

interface PosLineInput {
  product_id?: string | null;
  variant_id?: string | null;
  barcode?: string | null;
  designation: string;
  quantity: number;
  unit_price: number;
  tax_rate?: number;
  discount_percent?: number;
  position?: number;
}

interface PosPaymentInput {
  payment_method: string;
  amount: number;
  cash_given?: number | null;
  change_given?: number | null;
  card_reference?: string | null;
}

/** Business-rule failure inside the create transaction → mapped to an HTTP error. */
class PosSaleError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

/**
 * Next ticket number for today, derived from the current max suffix. MUST be
 * called inside the create $transaction; a concurrent winner surfaces as P2002
 * on (tenantId, ticketNumber) and the caller retries (mirrors purchases).
 */
async function generateTicketNumber(
  tx: Prisma.TransactionClient,
  tenantId: string
): Promise<string> {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const latest = await tx.posTransaction.findFirst({
    where: { tenantId, ticketNumber: { startsWith: `POS-${today}-` } },
    orderBy: { ticketNumber: "desc" },
    select: { ticketNumber: true },
  });

  let seq = 1;
  if (latest) {
    const lastSeq = parseInt(latest.ticketNumber.split("-").pop() || "0", 10);
    seq = lastSeq + 1;
  }
  return `POS-${today}-${String(seq).padStart(4, "0")}`;
}

export const POST = withAuth(async (req, { tenantId, session: authSession }) => {
  const denied = await requirePermission(authSession, "pos", "create");
  if (denied) return denied;

  // The offline queue replays lost-response POSTs, so the client sends an
  // idempotency key to make replays safe. It isn't part of posTransactionSchema
  // (Zod strips unknown keys), so read it from a clone before validation
  // consumes the body.
  const rawBody = (await req
    .clone()
    .json()
    .catch(() => null)) as { idempotency_key?: unknown } | null;
  const idempotencyKey =
    rawBody && typeof rawBody.idempotency_key === "string" && rawBody.idempotency_key
      ? rawBody.idempotency_key
      : null;

  const body = await validateBody(req, posTransactionSchema);
  if (isValidationError(body)) return body;

  // Replay of an already-recorded sale → return it as-is (no double charge,
  // no double stock decrement).
  if (idempotencyKey) {
    const existing = await prisma.posTransaction.findFirst({
      where: { tenantId, idempotencyKey },
      include: { lines: true, payments: true },
    });
    if (existing) return NextResponse.json(toSnakeCase(existing));
  }

  // Calculate totals from lines
  const lines = body.lines || [];
  let subtotal = 0;
  let taxAmount = 0;
  for (const line of lines) {
    const lineTotal = line.quantity * line.unit_price;
    const discount = lineTotal * (line.discount_percent || 0) / 100;
    const ht = lineTotal - discount;
    const vat = ht * (line.tax_rate || 0) / 100;
    subtotal += ht;
    taxAmount += vat;
  }
  const total = subtotal + taxAmount;

  // Resolve the cost price for each line up-front so we can freeze it on the line.
  // ProductVariant has no purchase price of its own, so variants inherit the parent product's.
  // All lookups are tenant-scoped and every client-supplied id must resolve —
  // otherwise a crafted payload could decrement another tenant's stock.
  const directProductIds = lines.map((l) => l.product_id).filter((id): id is string => !!id);
  const variantIds = Array.from(new Set(lines.map((l) => l.variant_id).filter((id): id is string => !!id)));
  const variants = variantIds.length
    ? await prisma.productVariant.findMany({ where: { tenantId, id: { in: variantIds } }, select: { id: true, productId: true } })
    : [];
  if (variants.length !== variantIds.length) {
    return NextResponse.json(
      { error: "One or more variants do not exist" },
      { status: 400 }
    );
  }
  const variantToProduct = new Map(variants.map((v) => [v.id, v.productId]));
  const allProductIds = Array.from(new Set([...directProductIds, ...variants.map((v) => v.productId)]));
  const products = allProductIds.length
    ? await prisma.product.findMany({ where: { tenantId, id: { in: allProductIds } }, select: { id: true, purchasePrice: true } })
    : [];
  const foundProductIds = new Set(products.map((p) => p.id));
  if (allProductIds.some((id) => !foundProductIds.has(id))) {
    return NextResponse.json(
      { error: "One or more products do not exist" },
      { status: 400 }
    );
  }
  const productCost = new Map(products.map((p) => [p.id, p.purchasePrice ?? 0]));
  const resolveCost = (l: PosLineInput): number => {
    const productId = l.variant_id ? variantToProduct.get(l.variant_id) ?? l.product_id : l.product_id;
    if (productId && productCost.has(productId)) return productCost.get(productId) ?? 0;
    return 0;
  };

  const discountPercent = body.discount_percent || 0;
  const discountAmount = body.discount_amount || (total * discountPercent / 100);
  const finalAmount = total - discountAmount;

  // Resolve the sale's location from its register. Stock is deducted from the
  // register's configured location; when the register has none, applyStockChange
  // falls back to the tenant's default location (null → default).
  const register = await prisma.posRegister.findFirst({
    where: { tenantId, id: body.register_id },
    select: { locationId: true },
  });
  const saleLocationId = register?.locationId ?? null;

  // Create the transaction and deduct stock atomically: a mid-loop failure must
  // not leave a COMPLETED sale with only some lines decremented. Retried on a
  // ticket-number collision (concurrent sale won the same suffix).
  const MAX_RETRIES = 3;
  try {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const transaction = await prisma.$transaction(async (tx) => {
          // The sale must land in an OPEN session on this register, owned by
          // this tenant — never a closed or foreign session.
          const openSession = await tx.posSession.findFirst({
            where: { tenantId, id: body.session_id, registerId: body.register_id, status: "OPEN" },
            select: { id: true },
          });
          if (!openSession) {
            throw new PosSaleError("No open session found for this register", 400);
          }

          const ticketNumber = await generateTicketNumber(tx, tenantId);

          const created = await tx.posTransaction.create({
            data: {
              tenantId,
              ticketNumber,
              idempotencyKey,
              registerId: body.register_id,
              sessionId: body.session_id,
              clientId: body.client_id || null,
              userId: authSession.userId,
              subtotal,
              taxAmount,
              total,
              discountPercent,
              discountAmount,
              finalAmount,
              status: "COMPLETED",
              notes: body.notes || null,
              lines: {
                create: lines.map((l: PosLineInput, i: number) => {
                  const lineHt = l.quantity * l.unit_price * (1 - (l.discount_percent || 0) / 100);
                  const lineVat = lineHt * (l.tax_rate || 0) / 100;
                  return {
                    productId: l.product_id || null,
                    variantId: l.variant_id || null,
                    barcode: l.barcode || null,
                    designation: l.designation,
                    quantity: l.quantity,
                    unitPrice: l.unit_price,
                    taxRate: l.tax_rate || 0,
                    subtotal: lineHt,
                    taxAmount: lineVat,
                    total: lineHt + lineVat,
                    discountPercent: l.discount_percent || 0,
                    position: i,
                    costPriceSnapshot: resolveCost(l),
                  };
                }),
              },
              payments: {
                create: (body.payments || []).map((p: PosPaymentInput) => ({
                  paymentMethod: p.payment_method,
                  amount: p.amount,
                  cashGiven: p.cash_given || null,
                  changeGiven: p.change_given || null,
                  cardReference: p.card_reference || null,
                })),
              },
            },
            include: { lines: true, payments: true },
          });

          // Update stock for product lines via the inventory ledger (clamps at zero).
          for (const line of lines) {
            const qty = Math.round(line.quantity);
            if (line.variant_id) {
              const productId = variantToProduct.get(line.variant_id) ?? line.product_id;
              if (!productId) continue;
              await applyStockChange(tx, {
                tenantId,
                productId,
                variantId: line.variant_id,
                locationId: saleLocationId,
                type: "sale",
                quantityChange: -qty,
                referenceType: "pos_transaction",
                referenceId: created.id,
                userId: authSession.userId,
              });
            } else if (line.product_id) {
              await applyStockChange(tx, {
                tenantId,
                productId: line.product_id,
                locationId: saleLocationId,
                type: "sale",
                quantityChange: -qty,
                referenceType: "pos_transaction",
                referenceId: created.id,
                userId: authSession.userId,
              });
            }
          }

          return created;
        });

        return NextResponse.json(toSnakeCase(transaction));
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        // A concurrent request may have committed this exact sale (same
        // idempotency key) between our pre-check and the create — return it.
        if (idempotencyKey) {
          const existing = await prisma.posTransaction.findFirst({
            where: { tenantId, idempotencyKey },
            include: { lines: true, payments: true },
          });
          if (existing) return NextResponse.json(toSnakeCase(existing));
        }
        // Otherwise it was a ticket-number collision → retry with a fresh suffix.
        if (attempt === MAX_RETRIES - 1) throw err;
      }
    }
  } catch (err) {
    if (err instanceof PosSaleError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  return NextResponse.json({ error: "Failed to generate unique ticket number" }, { status: 500 });
});
