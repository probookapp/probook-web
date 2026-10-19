import { Prisma } from "@/generated/prisma/client";
import { prisma } from "./db";
import { num } from "./money";
import { PAYABLE_PURCHASE_STATUSES } from "./purchase-status";

/**
 * The account a business keeps with each supplier.
 *
 * One sign throughout: a positive balance is money the business owes the
 * supplier, a negative one is credit the supplier holds for the business.
 *
 *   balance = opening balance
 *           + received orders (PAYABLE_PURCHASE_STATUSES, at their total)
 *           + adjustments (signed)
 *           - payments (by hand or from a till)
 *           - returns kept by the supplier as credit
 *
 * Every screen that answers "what do I owe this supplier?" reads it from here:
 * the suppliers list, the account panel and the statement.
 */

type Db = Prisma.TransactionClient | typeof prisma;

/** Under a hundredth of the currency: rounding noise, not money still owed. */
const EPSILON = 0.005;

export type SupplierLedgerType = "opening" | "order" | "adjustment" | "payment" | "return";

export interface SupplierLedgerEvent {
  time: number;
  date: Date;
  type: SupplierLedgerType;
  reference: string;
  /** Free text shown next to the reference: the adjustment's reason, the payment's note. */
  label: string | null;
  /** What the event adds to the debt. */
  debit: number;
  /** What it takes off. */
  credit: number;
  /** The record behind the line, for links (order, return). */
  recordId: string | null;
}

/**
 * Per-supplier balances for a tenant, in five aggregate queries regardless of
 * how many suppliers there are. Suppliers with nothing recorded are absent.
 */
export async function getSupplierBalances(
  db: Db,
  tenantId: string,
  supplierIds?: string[]
): Promise<Map<string, number>> {
  const scope = supplierIds ? { supplierId: { in: supplierIds } } : {};
  const [suppliers, orders, adjustments, payments, returns] = await Promise.all([
    db.supplier.findMany({
      where: { tenantId, ...(supplierIds ? { id: { in: supplierIds } } : {}), openingBalance: { not: 0 } },
      select: { id: true, openingBalance: true },
    }),
    db.purchaseOrder.groupBy({
      by: ["supplierId"],
      where: { tenantId, ...scope, status: { in: [...PAYABLE_PURCHASE_STATUSES] } },
      _sum: { total: true },
    }),
    db.supplierAdjustment.groupBy({
      by: ["supplierId"],
      where: { tenantId, ...scope },
      _sum: { amount: true },
    }),
    db.supplierPayment.groupBy({
      by: ["supplierId"],
      where: { tenantId, ...scope },
      _sum: { amount: true },
    }),
    db.supplierReturn.groupBy({
      by: ["supplierId"],
      where: { tenantId, ...scope },
      _sum: { total: true },
    }),
  ]);

  const balances = new Map<string, number>();
  const add = (id: string, amount: number) => balances.set(id, (balances.get(id) ?? 0) + amount);
  for (const s of suppliers) add(s.id, num(s.openingBalance));
  for (const r of orders) add(r.supplierId, num(r._sum.total));
  for (const r of adjustments) add(r.supplierId, num(r._sum.amount));
  for (const r of payments) add(r.supplierId, -num(r._sum.amount));
  for (const r of returns) add(r.supplierId, -num(r._sum.total));
  // Rounding noise reads as "settled".
  for (const [id, value] of balances) if (Math.abs(value) < EPSILON) balances.set(id, 0);
  return balances;
}

/**
 * What has been settled against one order: payments linked to it plus the
 * returns made against it. Used for the order's payment status and for the
 * "remaining" figure a payment form proposes.
 */
export async function getOrderSettled(
  db: Db,
  tenantId: string,
  orderIds: string[]
): Promise<Map<string, number>> {
  if (orderIds.length === 0) return new Map();
  const [payments, returns] = await Promise.all([
    db.supplierPayment.groupBy({
      by: ["purchaseOrderId"],
      where: { tenantId, purchaseOrderId: { in: orderIds } },
      _sum: { amount: true },
    }),
    db.supplierReturn.groupBy({
      by: ["purchaseOrderId"],
      where: { tenantId, purchaseOrderId: { in: orderIds } },
      _sum: { total: true },
    }),
  ]);
  const settled = new Map<string, number>();
  for (const r of payments) {
    if (r.purchaseOrderId) settled.set(r.purchaseOrderId, (settled.get(r.purchaseOrderId) ?? 0) + num(r._sum.amount));
  }
  for (const r of returns) {
    if (r.purchaseOrderId) settled.set(r.purchaseOrderId, (settled.get(r.purchaseOrderId) ?? 0) + num(r._sum.total));
  }
  return settled;
}

/** UNPAID / PARTIAL / PAID from what has been settled against the order's total. */
export function paymentStatusFor(total: number, settled: number): "UNPAID" | "PARTIAL" | "PAID" {
  if (settled <= EPSILON) return "UNPAID";
  return settled >= total - EPSILON ? "PAID" : "PARTIAL";
}

/** Recompute and store an order's payment status after a payment or a return. */
export async function refreshOrderPaymentStatus(db: Db, tenantId: string, orderId: string) {
  const order = await db.purchaseOrder.findFirst({
    where: { tenantId, id: orderId },
    select: { id: true, total: true },
  });
  if (!order) return;
  const settled = (await getOrderSettled(db, tenantId, [orderId])).get(orderId) ?? 0;
  await db.purchaseOrder.update({
    where: { tenantId, id: orderId },
    data: { paymentStatus: paymentStatusFor(num(order.total), settled) },
  });
}

/** Every event on a supplier's account, unsorted. */
export async function getSupplierLedgerEvents(
  db: Db,
  tenantId: string,
  supplierId: string
): Promise<SupplierLedgerEvent[]> {
  const [supplier, orders, adjustments, payments, returns] = await Promise.all([
    db.supplier.findFirst({
      where: { tenantId, id: supplierId },
      select: { openingBalance: true, createdAt: true },
    }),
    db.purchaseOrder.findMany({
      where: { tenantId, supplierId, status: { in: [...PAYABLE_PURCHASE_STATUSES] } },
      select: { id: true, orderNumber: true, orderDate: true, total: true },
    }),
    db.supplierAdjustment.findMany({
      where: { tenantId, supplierId },
      select: { id: true, amount: true, adjustmentDate: true, reason: true },
    }),
    db.supplierPayment.findMany({
      where: { tenantId, supplierId },
      select: {
        id: true,
        amount: true,
        paymentDate: true,
        reference: true,
        notes: true,
        fromRegister: true,
        purchaseOrder: { select: { orderNumber: true } },
      },
    }),
    db.supplierReturn.findMany({
      where: { tenantId, supplierId },
      select: { id: true, returnNumber: true, returnDate: true, total: true, reason: true },
    }),
  ]);

  const events: SupplierLedgerEvent[] = [];
  const opening = num(supplier?.openingBalance);
  if (supplier && Math.abs(opening) >= EPSILON) {
    // The balance carried over from before the app comes before everything,
    // even a payment back-dated to before the supplier was entered: it heads
    // the statement, and any date range counts it in the opening balance.
    // Shown with the day the supplier was entered.
    events.push({
      time: Number.MIN_SAFE_INTEGER,
      date: supplier.createdAt,
      type: "opening",
      reference: "",
      label: null,
      debit: Math.max(opening, 0),
      credit: Math.max(-opening, 0),
      recordId: null,
    });
  }
  for (const o of orders) {
    events.push({
      time: new Date(o.orderDate).getTime(),
      date: o.orderDate,
      type: "order",
      reference: o.orderNumber,
      label: null,
      debit: num(o.total),
      credit: 0,
      recordId: o.id,
    });
  }
  for (const a of adjustments) {
    const amount = num(a.amount);
    events.push({
      time: new Date(a.adjustmentDate).getTime(),
      date: a.adjustmentDate,
      type: "adjustment",
      reference: "",
      label: a.reason,
      debit: Math.max(amount, 0),
      credit: Math.max(-amount, 0),
      recordId: a.id,
    });
  }
  for (const p of payments) {
    events.push({
      time: new Date(p.paymentDate).getTime(),
      date: p.paymentDate,
      type: "payment",
      reference: p.reference || p.purchaseOrder?.orderNumber || "",
      label: p.notes,
      debit: 0,
      credit: num(p.amount),
      recordId: p.id,
    });
  }
  for (const r of returns) {
    events.push({
      time: new Date(r.returnDate).getTime(),
      date: r.returnDate,
      type: "return",
      reference: r.returnNumber,
      label: r.reason,
      debit: 0,
      credit: num(r.total),
      recordId: r.id,
    });
  }
  return events;
}

/** Same-day order: what is owed comes before what settles it. */
export const LEDGER_TYPE_ORDER: Record<SupplierLedgerType, number> = {
  opening: 0,
  order: 1,
  adjustment: 2,
  return: 3,
  payment: 4,
};
