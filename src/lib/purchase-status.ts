/**
 * The states a purchase order moves through, and which of them mean money.
 *
 * A confirmed order is fully received; a partially received one is not, but the
 * goods that did arrive still have to be paid for. Every report that adds up
 * what a supplier is owed therefore has to count both — the accounting export,
 * the supplier-spend report and the tax summary each spelled that out for
 * themselves.
 *
 * The supplier credit view spelled out only "CONFIRMED". A part-delivered order
 * was invisible there: no balance, no line in the unpaid list, so the screen
 * that exists to answer "what do I owe this supplier?" answered zero while the
 * stock sat on the shelf. Naming the rule once is the fix.
 */
export const PURCHASE_ORDER_STATUSES = [
  "PENDING",
  "PARTIALLY_RECEIVED",
  "CONFIRMED",
  "CANCELLED",
] as const;

export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

/** The states in which goods have been received, so the order is payable. */
export const PAYABLE_PURCHASE_STATUSES = ["CONFIRMED", "PARTIALLY_RECEIVED"] as const;
