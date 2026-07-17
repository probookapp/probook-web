import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { applyStockChange } from "@/lib/stock";
import { requirePermission } from "@/lib/permissions-server";

export const POST = withAuth(async (req, { tenantId, params, session }) => {
  const denied = await requirePermission(session, "pos", "delete");
  if (denied) return denied;
  const body = await req.json().catch(() => ({} as { reason?: string }));
  const transaction = await prisma.posTransaction.findFirst({
    where: { tenantId, id: params?.id },
    include: { lines: true },
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

  // Restore stock through the inventory ledger (mirror of the sale decrement).
  for (const line of transaction.lines) {
    const qty = Math.round(line.quantity);
    let productId = line.productId;
    if (!productId && line.variantId) {
      const variant = await prisma.productVariant.findUnique({
        where: { id: line.variantId },
        select: { productId: true },
      });
      productId = variant?.productId ?? null;
    }
    if (!productId) continue;
    const key = `${productId}:${line.variantId ?? ""}`;
    const locationId = movementLocationByKey.get(key) ?? fallbackLocationId;
    await applyStockChange(prisma, {
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

  const updated = await prisma.posTransaction.update({
    where: { tenantId, id: params?.id },
    data: {
      status: "CANCELLED",
      notes: body.reason ? `Cancelled: ${body.reason}` : "Cancelled",
    },
  });
  return NextResponse.json(toSnakeCase(updated));
});
