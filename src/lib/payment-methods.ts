/**
 * Where money sits once it has changed hands: in the cash drawer, in cheques
 * not yet banked, or at the bank.
 *
 * Three screens grew three vocabularies for the same few methods:
 *  - invoice payments and expenses: "especes", "cheque", "virement", "carte",
 *    "prelevement", "autre" (lower-case French, see PaymentForm);
 *  - the till: "CASH", "CHEQUE", "CARD", "TRANSFER", "CREDIT";
 *  - supplier payments: "CASH", "CHECK", "BANK_TRANSFER", "OTHER".
 * Rows of every kind are already stored, so instead of rewriting them this is
 * the one place that reads any of them, for the cash journal and the FEC.
 */

export const MONEY_BUCKETS = ["cash", "cheque", "bank"] as const;
export type MoneyBucket = (typeof MONEY_BUCKETS)[number];

const BUCKET_OF: Record<string, MoneyBucket | null> = {
  especes: "cash",
  cash: "cash",
  cheque: "cheque",
  check: "cheque",
  virement: "bank",
  transfer: "bank",
  bank_transfer: "bank",
  carte: "bank",
  card: "bank",
  prelevement: "bank",
  // Sold on account at the till: no money moved.
  credit: null,
};

/**
 * The bucket a payment method lands in, or null when it is not money that can
 * be followed ("autre", a till sale on credit, an unknown legacy value).
 */
export function moneyBucket(method: string | null | undefined): MoneyBucket | null {
  if (!method) return null;
  return BUCKET_OF[method.trim().toLowerCase()] ?? null;
}

/**
 * The methods an expense can be paid by: the invoice payments' vocabulary, so
 * one set of labels (common:payments.methods.*) serves both.
 */
export const EXPENSE_PAYMENT_METHODS = ["especes", "cheque", "virement", "carte", "prelevement", "autre"] as const;
export type ExpensePaymentMethod = (typeof EXPENSE_PAYMENT_METHODS)[number];

/** The common:payments.methods.* label key of a method from any vocabulary. */
export function paymentMethodLabelKey(method: string | null | undefined): string {
  switch ((method ?? "").trim().toLowerCase()) {
    case "especes":
    case "cash":
      return "payments.methods.cash";
    case "cheque":
    case "check":
      return "payments.methods.check";
    case "virement":
    case "transfer":
    case "bank_transfer":
      return "payments.methods.transfer";
    case "carte":
    case "card":
      return "payments.methods.card";
    case "prelevement":
      return "payments.methods.directDebit";
    default:
      return "payments.methods.other";
  }
}
