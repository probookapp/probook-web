import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { applyStockChange } from "@/lib/stock";
import { requirePermission } from "@/lib/permissions-server";

// Sentinel thrown inside the transaction when another request cancelled first;
// rolls everything back so a double-cancel can never double-restock.
const ALREADY_CANCELLED = new Error("already cancelled");

export const POST = withAuth(async (req, { tenantId, params, session }) => {
  const denied = await requirePermission(session, "pos", "delete");
  if (denied) return denied;
  const body = await req.json().catch(() => ({} as { reason?: string }));
  const transaction = await prisma.posTransaction.findFirst({
    where: { tenantId, id: params?.id },
    include: { lines: true, payments: true },
  });
  if (!transaction) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (transaction.status === "CANCELLED") {
    return NextResponse.json({ error: "Already cancelled" }, { status: 400 });
  }

  // Restore stock to the SAME location the sale deducted from. The original
  // "sale" ledger rows recorded that location, so key on product/variant to
  // look it up. Fall back to the register's location, then default (null).
  const saleMovements = await prisma.stockMovement.findMany({
    where: {
      tenantId,
      referenceType: "pos_transaction",
      referenceId: transaction.id,
      type: "sale",
    },
    select: { productId: true, variantId: true, locationId: true },
  });
  const movementLocationByKey = new Map<string, string | null>(
    saleMovements.map((m) => [`${m.productId}:${m.variantId ?? ""}`, m.locationId])
  );
  const register = transaction.registerId
    ? await prisma.posRegister.findFirst({
        where: { tenantId, id: transaction.registerId },
        select: { locationId: true },
      })
    : null;
  const fallbackLocationId = register?.locationId ?? null;

  // Net cash this sale put in the drawer (CASH payments minus recorded change):
  // cancelling means handing it back, so the till needs a compensating OUT.
  const cashPaid = transaction.payments
    .filter((p) => p.paymentMethod === "CASH")
    .reduce((sum, p) => sum + Math.max(0, p.amount - (p.changeGiven ?? 0)), 0);

  // Flip the status, restore stock and reverse cash atomically. The guarded
  // updateMany is the authoritative double-cancel check: only the request that
  // actually flips COMPLETED → CANCELLED (count === 1) restocks.
  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      const flipped = await tx.posTransaction.updateMany({
        where: { id: transaction.id, tenantId, status: { not: "CANCELLED" } },
        data: {
          status: "CANCELLED",
          notes: body.reason ? `Cancelled: ${body.reason}` : "Cancelled",
        },
      });
      if (flipped.count !== 1) throw ALREADY_CANCELLED;

      // Restore stock through the inventory ledger (mirror of the sale decrement).
      for (const line of transaction.lines) {
        const qty = Math.round(line.quantity);
        let productId = line.productId;
        if (!productId && line.variantId) {
          const variant = await tx.productVariant.findFirst({
            where: { tenantId, id: line.variantId },
            select: { productId: true },
          });
          productId = variant?.productId ?? null;
        }
        if (!productId) continue;
        const key = `${productId}:${line.variantId ?? ""}`;
        const locationId = movementLocationByKey.get(key) ?? fallbackLocationId;
        await applyStockChange(tx, {
          tenantId,
          productId,
          variantId: line.variantId ?? null,
          locationId,
          type: "return",
          quantityChange: qty,
          referenceType: "pos_transaction",
          referenceId: transaction.id,
          userId: session.userId,
        });
      }

      // Reverse the cash-paid portion out of the till — only while the sale's
      // session is still OPEN (a closed session's counted drawer must not move).
      let cashReversed = false;
      if (cashPaid > 0 && transaction.sessionId) {
        const posSession = await tx.posSession.findFirst({
          where: { tenantId, id: transaction.sessionId, status: "OPEN" },
          select: { id: true },
        });
        if (posSession) {
          await tx.posCashMovement.create({
            data: {
              tenantId,
              sessionId: posSession.id,
              userId: session.userId,
              movementType: "OUT",
              amount: Math.round(cashPaid * 100) / 100,
              reason: `Cancelled ticket ${transaction.ticketNumber}`,
              reference: transaction.ticketNumber,
            },
          });
          cashReversed = true;
        }
      }

      const updated = await tx.posTransaction.findFirst({
        where: { tenantId, id: transaction.id },
      });
      return { updated, cashReversed };
    });
  } catch (err) {
    if (err === ALREADY_CANCELLED) {
      return NextResponse.json({ error: "Already cancelled" }, { status: 400 });
    }
    throw err;
  }

  const skippedCashReversal = cashPaid > 0 && !result.cashReversed;
  return NextResponse.json({
    ...toSnakeCase(result.updated),
    ...(skippedCashReversal
      ? {
          warning:
            "The sale's cash was not reversed from a till because its session is closed — record the cash refund manually.",
        }
      : {}),
  });
});
