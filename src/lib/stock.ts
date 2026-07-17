import { Prisma } from "@/generated/prisma/client";
import { prisma } from "./db";

/**
 * Shared inventory-ledger helper — now location-aware.
 *
 * Stock is tracked per-location in `stock_levels`. The aggregate
 * `Product.quantity` / `ProductVariant.quantity` is kept in sync as the SUM
 * across all locations, so existing code that reads `.quantity` still sees the
 * total on-hand. Every stock change should go through {@link applyStockChange}.
 */

export type StockMovementType =
  | "initial"
  | "sale"
  | "purchase"
  | "adjustment"
  | "return"
  | "transfer_in"
  | "transfer_out";

type Db = Prisma.TransactionClient | typeof prisma;

/** Returns the tenant's default location id, creating a "Main" one if absent. */
export async function getDefaultLocationId(db: Db, tenantId: string): Promise<string> {
  const existing = await db.location.findFirst({
    where: { tenantId, isDefault: true },
    select: { id: true },
  });
  if (existing) return existing.id;

  // Fall back to any location, else create a default one.
  const any = await db.location.findFirst({ where: { tenantId }, select: { id: true } });
  if (any) return any.id;

  const created = await db.location.create({
    data: { tenantId, name: "Main", type: "store", isDefault: true, isActive: true },
    select: { id: true },
  });
  return created.id;
}

export interface StockChangeInput {
  tenantId: string;
  productId: string;
  variantId?: string | null;
  /** Location the change applies to. Defaults to the tenant's default location. */
  locationId?: string | null;
  type: StockMovementType;
  /** Signed delta: negative = stock out, positive = stock in. */
  quantityChange: number;
  reason?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  userId?: string | null;
}

/** Sets the per-location on-hand for a product/variant (upsert by find-or-create). */
async function setLevelQuantity(
  db: Db,
  tenantId: string,
  locationId: string,
  productId: string,
  variantId: string | null,
  quantity: number
): Promise<void> {
  // Can't rely on a unique upsert because variantId is nullable (Postgres treats
  // NULLs as distinct), so find-or-create explicitly.
  const existing = await db.stockLevel.findFirst({
    where: { locationId, productId, variantId: variantId ?? null },
    select: { id: true },
  });
  if (existing) {
    await db.stockLevel.update({ where: { id: existing.id }, data: { quantity } });
  } else {
    await db.stockLevel.create({
      data: { tenantId, locationId, productId, variantId: variantId ?? null, quantity },
    });
  }
}

/**
 * Apply a signed stock delta at a location AND append a ledger row, returning
 * the new location balance. On-hand is clamped at zero; the same applied delta
 * is mirrored to the aggregate Product/Variant quantity so the total stays the
 * sum across locations.
 *
 * Concurrency: the per-location level row is locked with `SELECT ... FOR UPDATE`
 * so concurrent writers on the same product/location serialize (no lost updates
 * / oversell), and the aggregate is mirrored with an atomic `increment`. This
 * REQUIRES a transaction: when called with the base client we open our own so
 * the read-modify-write and the ledger append commit atomically; when called
 * with a transaction client we join the caller's transaction.
 */
export async function applyStockChange(
  db: Db,
  input: StockChangeInput
): Promise<number> {
  if ("$transaction" in db) {
    return (db as typeof prisma).$transaction((tx) => applyStockChangeTx(tx, input));
  }
  return applyStockChangeTx(db as Prisma.TransactionClient, input);
}

async function applyStockChangeTx(
  tx: Prisma.TransactionClient,
  input: StockChangeInput
): Promise<number> {
  const { tenantId, productId, variantId = null, quantityChange } = input;
  const locationId = input.locationId ?? (await getDefaultLocationId(tx, tenantId));

  // Find-or-create the level row, tolerating a concurrent creator.
  let level = await tx.stockLevel.findFirst({
    where: { locationId, productId, variantId: variantId ?? null },
    select: { id: true },
  });
  if (!level) {
    try {
      level = await tx.stockLevel.create({
        data: { tenantId, locationId, productId, variantId: variantId ?? null, quantity: 0 },
        select: { id: true },
      });
    } catch {
      level = await tx.stockLevel.findFirst({
        where: { locationId, productId, variantId: variantId ?? null },
        select: { id: true },
      });
    }
  }

  // Lock the level row so concurrent stock changes on it serialize, then read
  // the authoritative on-hand under that lock.
  let currentAtLocation = 0;
  if (level) {
    const locked = await tx.$queryRaw<Array<{ quantity: number }>>`
      SELECT "quantity" FROM "stock_levels" WHERE "id" = ${level.id} FOR UPDATE`;
    currentAtLocation = locked[0]?.quantity ?? 0;
  }

  const newAtLocation = Math.max(0, currentAtLocation + quantityChange);
  const appliedDelta = newAtLocation - currentAtLocation;

  if (level) {
    await tx.stockLevel.update({ where: { id: level.id }, data: { quantity: newAtLocation } });
  }

  // Mirror the applied delta onto the aggregate cache atomically.
  if (appliedDelta !== 0) {
    if (variantId) {
      await tx.productVariant.update({
        where: { id: variantId },
        data: { quantity: { increment: appliedDelta } },
      });
    } else {
      await tx.product.update({
        where: { id: productId },
        data: { quantity: { increment: appliedDelta } },
      });
    }
  }

  await tx.stockMovement.create({
    data: {
      tenantId,
      productId,
      variantId: variantId ?? null,
      locationId,
      type: input.type,
      quantityChange: appliedDelta,
      balanceAfter: newAtLocation,
      reason: input.reason ?? null,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      userId: input.userId ?? null,
    },
  });

  return newAtLocation;
}

/**
 * Record an "initial" stock entry for a newly-created product/variant at a
 * location (defaults to the tenant's default location). Also seeds the
 * per-location level. Assumes the aggregate quantity was already set by the
 * create call, so it does not touch it.
 */
export async function recordInitialStock(
  db: Db,
  input: Omit<StockChangeInput, "type" | "quantityChange"> & { quantity: number }
): Promise<void> {
  if (input.quantity === 0) return;
  const locationId = input.locationId ?? (await getDefaultLocationId(db, input.tenantId));

  await setLevelQuantity(
    db,
    input.tenantId,
    locationId,
    input.productId,
    input.variantId ?? null,
    input.quantity
  );

  await db.stockMovement.create({
    data: {
      tenantId: input.tenantId,
      productId: input.productId,
      variantId: input.variantId ?? null,
      locationId,
      type: "initial",
      quantityChange: input.quantity,
      balanceAfter: input.quantity,
      reason: input.reason ?? null,
      referenceType: input.referenceType ?? "manual",
      referenceId: input.referenceId ?? null,
      userId: input.userId ?? null,
    },
  });
}
