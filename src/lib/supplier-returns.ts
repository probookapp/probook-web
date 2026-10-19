import { Prisma } from "@/generated/prisma/client";
import { applyStockChange, getDefaultLocationId } from "./stock";
import { PAYABLE_PURCHASE_STATUSES } from "./purchase-status";
import { refreshOrderPaymentStatus } from "./supplier-account";

/**
 * Goods sent back to a supplier, who keeps their value as credit: the business
 * says "keep it as a payment" (an avoir fournisseur). The stock leaves the
 * location it sat in and the value comes off what is owed to that supplier.
 *
 * A return may name the order the goods came from. Then each line can point at
 * the order line, and cannot send back more than was received on it minus what
 * earlier returns already took. A return with no order is free: goods bought
 * before the app, or from a delivery that was never entered.
 *
 * Purchase prices are left alone: the goods go back at the price they were
 * bought, which is what the weighted average already holds.
 */

type Tx = Prisma.TransactionClient;

export class SupplierReturnError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

export interface SupplierReturnLineInput {
  product_id: string;
  variant_id?: string | null;
  purchase_order_line_id?: string | null;
  quantity: number;
  unit_price: number;
  tax_rate?: number;
}

export interface CreateSupplierReturnInput {
  tenantId: string;
  userId: string | null;
  supplierId: string;
  purchaseOrderId?: string | null;
  locationId?: string | null;
  returnDate: string;
  reason?: string | null;
  notes?: string | null;
  lines: SupplierReturnLineInput[];
}

function lineAmounts(line: SupplierReturnLineInput) {
  const subtotal = line.quantity * line.unit_price;
  const taxAmount = subtotal * ((line.tax_rate ?? 0) / 100);
  return { subtotal, taxAmount, total: subtotal + taxAmount };
}

async function nextReturnNumber(tx: Tx, tenantId: string): Promise<string> {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `RET-${today}-`;
  const latest = await tx.supplierReturn.findFirst({
    where: { tenantId, returnNumber: { startsWith: prefix } },
    orderBy: { returnNumber: "desc" },
    select: { returnNumber: true },
  });
  const seq = latest ? parseInt(latest.returnNumber.split("-").pop() || "0", 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

export async function createSupplierReturn(tx: Tx, input: CreateSupplierReturnInput) {
  const { tenantId } = input;

  const supplier = await tx.supplier.findFirst({
    where: { tenantId, id: input.supplierId },
    select: { id: true },
  });
  if (!supplier) throw new SupplierReturnError("Supplier not found", 404);

  // Products must exist in the tenant and hold stock.
  const productIds = Array.from(new Set(input.lines.map((l) => l.product_id)));
  const products = await tx.product.findMany({
    where: { tenantId, id: { in: productIds } },
    select: { id: true, isBundle: true, isService: true },
  });
  if (products.length !== productIds.length) {
    throw new SupplierReturnError("One or more products do not exist", 400);
  }
  if (products.some((p) => p.isBundle || p.isService)) {
    throw new SupplierReturnError("Only stocked products can be returned", 400, "NOT_STOCKED");
  }
  const variantIds = Array.from(new Set(input.lines.map((l) => l.variant_id).filter((v): v is string => !!v)));
  if (variantIds.length) {
    const variants = await tx.productVariant.findMany({
      where: { tenantId, id: { in: variantIds } },
      select: { id: true, productId: true },
    });
    const parentOf = new Map(variants.map((v) => [v.id, v.productId]));
    for (const l of input.lines) {
      if (l.variant_id && parentOf.get(l.variant_id) !== l.product_id) {
        throw new SupplierReturnError("Variant does not belong to the product", 400);
      }
    }
  }

  let locationId = input.locationId || null;

  if (input.purchaseOrderId) {
    // Lock the order: two returns against it cannot both pass the quantity check.
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "purchase_orders"
      WHERE "id" = ${input.purchaseOrderId} AND "tenant_id" = ${tenantId}
        AND "supplier_id" = ${input.supplierId}
      FOR UPDATE`;
    if (locked.length === 0) {
      throw new SupplierReturnError("Purchase order not found or does not belong to this supplier", 400);
    }
    const order = await tx.purchaseOrder.findFirstOrThrow({
      where: { tenantId, id: input.purchaseOrderId },
      select: {
        status: true,
        locationId: true,
        lines: {
          select: {
            id: true,
            productId: true,
            variantId: true,
            receivedQuantity: true,
            returnLines: { select: { quantity: true } },
          },
        },
      },
    });
    if (!(PAYABLE_PURCHASE_STATUSES as readonly string[]).includes(order.status)) {
      throw new SupplierReturnError("Only received orders can have returns", 400);
    }
    locationId = locationId ?? order.locationId;

    const orderLines = new Map(order.lines.map((l) => [l.id, l]));
    const asked = new Map<string, number>();
    for (const l of input.lines) {
      if (!l.purchase_order_line_id) continue;
      const ol = orderLines.get(l.purchase_order_line_id);
      if (!ol || ol.productId !== l.product_id || (ol.variantId ?? null) !== (l.variant_id ?? null)) {
        throw new SupplierReturnError("Line does not belong to this purchase order", 400);
      }
      asked.set(ol.id, (asked.get(ol.id) ?? 0) + l.quantity);
    }
    for (const [lineId, qty] of asked) {
      const ol = orderLines.get(lineId)!;
      const alreadyReturned = ol.returnLines.reduce((s, r) => s + r.quantity, 0);
      if (qty > (ol.receivedQuantity ?? 0) - alreadyReturned + 1e-6) {
        throw new SupplierReturnError("Cannot return more than was received", 400, "OVER_RECEIVED");
      }
    }
  } else if (input.lines.some((l) => l.purchase_order_line_id)) {
    throw new SupplierReturnError("Order lines need their purchase order", 400);
  }

  if (locationId) {
    const location = await tx.location.findFirst({ where: { tenantId, id: locationId }, select: { id: true } });
    if (!location) throw new SupplierReturnError("Location not found", 400);
  }

  // Goods that are not on the shelf cannot go back: the stock ledger would
  // clamp at zero and the return would claim more than left the building.
  const stockLocationId = locationId ?? (await getDefaultLocationId(tx, tenantId));
  const wanted = new Map<string, { productId: string; variantId: string | null; qty: number }>();
  for (const l of input.lines) {
    const key = `${l.product_id}:${l.variant_id || ""}`;
    const entry = wanted.get(key) ?? { productId: l.product_id, variantId: l.variant_id || null, qty: 0 };
    entry.qty += l.quantity;
    wanted.set(key, entry);
  }
  for (const w of wanted.values()) {
    const level = await tx.stockLevel.findFirst({
      where: { tenantId, locationId: stockLocationId, productId: w.productId, variantId: w.variantId },
      select: { quantity: true },
    });
    if ((level?.quantity ?? 0) < w.qty - 1e-6) {
      throw new SupplierReturnError("Not enough stock at this location", 400, "INSUFFICIENT_STOCK");
    }
  }

  let subtotal = 0;
  let taxAmount = 0;
  for (const l of input.lines) {
    const a = lineAmounts(l);
    subtotal += a.subtotal;
    taxAmount += a.taxAmount;
  }

  const created = await tx.supplierReturn.create({
    data: {
      tenantId,
      returnNumber: await nextReturnNumber(tx, tenantId),
      supplierId: input.supplierId,
      purchaseOrderId: input.purchaseOrderId || null,
      locationId: stockLocationId,
      returnDate: new Date(input.returnDate),
      reason: input.reason?.trim() || null,
      notes: input.notes?.trim() || null,
      subtotal,
      taxAmount,
      total: subtotal + taxAmount,
      userId: input.userId,
      lines: {
        create: input.lines.map((l) => {
          const a = lineAmounts(l);
          return {
            productId: l.product_id,
            variantId: l.variant_id || null,
            purchaseOrderLineId: l.purchase_order_line_id || null,
            quantity: l.quantity,
            unitPrice: l.unit_price,
            taxRate: l.tax_rate ?? 0,
            subtotal: a.subtotal,
            taxAmount: a.taxAmount,
            total: a.total,
          };
        }),
      },
    },
  });

  for (const l of input.lines) {
    await applyStockChange(tx, {
      tenantId,
      productId: l.product_id,
      variantId: l.variant_id || null,
      locationId: stockLocationId,
      type: "supplier_return",
      quantityChange: -Math.abs(l.quantity),
      referenceType: "supplier_return",
      referenceId: created.id,
      userId: input.userId,
    });
  }

  if (input.purchaseOrderId) {
    await refreshOrderPaymentStatus(tx, tenantId, input.purchaseOrderId);
  }
  return created;
}

/**
 * Cancel a return entered by mistake: the goods come back on the shelf at the
 * same location and the credit disappears from the supplier's account.
 */
export async function deleteSupplierReturn(tx: Tx, tenantId: string, id: string, userId: string | null) {
  const existing = await tx.supplierReturn.findFirst({
    where: { tenantId, id },
    include: { lines: true },
  });
  if (!existing) throw new SupplierReturnError("Not found", 404);

  for (const l of existing.lines) {
    await applyStockChange(tx, {
      tenantId,
      productId: l.productId,
      variantId: l.variantId,
      locationId: existing.locationId,
      type: "adjustment",
      quantityChange: Math.abs(l.quantity),
      reason: `Supplier return ${existing.returnNumber} cancelled`,
      referenceType: "supplier_return",
      referenceId: existing.id,
      userId,
    });
  }
  await tx.supplierReturn.delete({ where: { id: existing.id } });
  if (existing.purchaseOrderId) {
    await refreshOrderPaymentStatus(tx, tenantId, existing.purchaseOrderId);
  }
}
