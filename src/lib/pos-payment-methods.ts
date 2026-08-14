/**
 * How a counter sale can be settled.
 *
 * CASH and CARD were the only two options, which meant a business that takes
 * cheques or bank transfers had to record the sale as something it was not.
 * CREDIT is the fifth case: goods handed over against the client's account,
 * to be collected later.
 *
 * Only CASH moves the drawer. That is the one invariant the register's
 * end-of-day reconciliation depends on, so it lives here rather than being
 * re-decided in each report.
 */
export const POS_PAYMENT_METHODS = ["CASH", "CARD", "CHEQUE", "TRANSFER", "CREDIT"] as const;

export type PosPaymentMethod = (typeof POS_PAYMENT_METHODS)[number];

/** Methods that put money in the till, and so count toward the expected cash. */
export function movesTheDrawer(method: string): boolean {
  return method.toUpperCase() === "CASH";
}

/** Methods that settle the sale on the spot — everything except client credit. */
export function settlesImmediately(method: string): boolean {
  return method.toUpperCase() !== "CREDIT";
}

/**
 * A reference the cashier can note: cheque number, transfer reference, card
 * authorisation. Stored in `PosPayment.cardReference`, which predates the other
 * methods — the column is kept rather than renamed so no historical row moves.
 */
export function methodTakesReference(method: string): boolean {
  const m = method.toUpperCase();
  return m === "CHEQUE" || m === "TRANSFER" || m === "CARD";
}
