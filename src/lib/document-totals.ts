/**
 * The one place quote and invoice totals are computed.
 *
 * Both routes used to carry their own copy of this arithmetic, which is exactly
 * the kind of duplication that lets two documents disagree about what the same
 * lines are worth.
 *
 * ─── How a discount is applied ───
 *
 * A line discount reduces that line's own pre-tax base, so the line stays
 * self-consistent: subtotal = qty x price - discount, tax = subtotal x rate.
 *
 * A document discount is deliberately NOT folded into the lines. It is kept as
 * its own figure and printed as its own row, the way a commercial invoice reads:
 *
 *     lines .................. 100 000,000
 *     remise commerciale ....  -10 000,000
 *     base HT ................  90 000,000
 *     TVA 19% ................  17 100,000
 *
 * Two consequences that matter fiscally:
 *  - the document stays reconstructable from its own lines plus one stated
 *    discount; a total that cannot be recomputed from the document is not a
 *    valid fiscal document.
 *  - VAT is charged on the DISCOUNTED base, spread across lines in proportion
 *    to their weight, so each VAT rate keeps a correct taxable base. Charging
 *    VAT on the undiscounted base would overcharge the customer's tax.
 *
 * Shipping is never discounted: a commercial gesture applies to the goods.
 */

import { currencyMinorUnits, roundToUnits } from "./money";

/**
 * Rounding follows the CURRENCY, not a fixed two decimals: the dinar tunisien
 * is denominated in millimes, and rounding its totals to the centime silently
 * dropped them. Callers that know the tenant's currency pass it; the default
 * matches the dinar algérien and the euro.
 */
const makeRound = (currency?: string | null) => {
  const units = currencyMinorUnits(currency ?? "DZD");
  return (n: number) => roundToUnits(n, units);
};

/** Currency the document is denominated in; decides the rounding step. */
export type MoneyCurrency = string | null | undefined;

export interface TotalsLineInput {
  quantity: number;
  unit_price: number;
  tax_rate: number;
  /** Percentage off this line's pre-tax base. */
  discount_percent?: number | null;
  /** Presentation-only rows carry no value of their own. */
  is_subtotal_line?: boolean | null;
}

export interface LineTotals {
  /** Pre-tax, after the line's own discount. */
  subtotal: number;
  taxAmount: number;
  total: number;
  /** What the line discount took off, for display. */
  discount: number;
}

export interface DocumentTotalsInput {
  lines: TotalsLineInput[];
  shippingCost?: number | null;
  shippingTaxRate?: number | null;
  /** Percentage off the lines' combined pre-tax base. */
  discountPercent?: number | null;
  /** Fixed amount off, applied after the percentage. */
  discountAmount?: number | null;
  /** Tenant currency — decides whether amounts round to centimes or millimes. */
  currency?: MoneyCurrency;
}

export interface DocumentTotals {
  /** Taxable base: lines after every discount, plus shipping. */
  subtotal: number;
  taxAmount: number;
  total: number;
  /** Lines before the document discount — the "sous-total" row. */
  linesSubtotal: number;
  /** What the document discount took off. */
  documentDiscount: number;
}

export function calculateLineTotals(
  line: TotalsLineInput,
  currency?: MoneyCurrency
): LineTotals {
  const round = makeRound(currency);
  const base = round(line.quantity * line.unit_price);
  const pct = clampPercent(line.discount_percent);
  const discount = round(base * (pct / 100));
  const subtotal = round(base - discount);
  const taxAmount = round(subtotal * (line.tax_rate / 100));
  return { subtotal, taxAmount, total: round(subtotal + taxAmount), discount };
}

/**
 * The document discount implied by a stated percent and amount.
 *
 * Reporting code needs this too: a VAT return and an accounting export read
 * documents back from the database, and a per-rate breakdown that ignored the
 * discount would not reconcile with the invoice's own stored totals. Same
 * function, so the ledger and the invoice can never disagree.
 *
 * `keptRatio` is the share of each line that survives the discount — multiply a
 * line's stored subtotal and tax by it to get its discounted contribution.
 */
export function resolveDocumentDiscount(
  linesSubtotal: number,
  discountPercent?: number | null,
  discountAmount?: number | null,
  currency?: MoneyCurrency
): { amount: number; keptRatio: number } {
  const round = makeRound(currency);
  // Percentage first, then the fixed amount; never more than the base itself,
  // so a document can't end up with a negative taxable base.
  const byPercent = round(linesSubtotal * (clampPercent(discountPercent) / 100));
  const requested = round(byPercent + Math.max(0, discountAmount ?? 0));
  const amount = Math.min(requested, Math.max(0, linesSubtotal));
  const keptRatio = linesSubtotal > 0 ? (linesSubtotal - amount) / linesSubtotal : 1;
  return { amount, keptRatio };
}

export function calculateDocumentTotals(input: DocumentTotalsInput): DocumentTotals {
  const round = makeRound(input.currency);
  const shippingCost = Math.max(0, input.shippingCost ?? 0);
  const shippingTaxRate = input.shippingTaxRate ?? 0;

  const priced = input.lines
    .filter((l) => !l.is_subtotal_line)
    .map((l) => ({ line: l, totals: calculateLineTotals(l, input.currency) }));

  const linesSubtotal = round(priced.reduce((s, p) => s + p.totals.subtotal, 0));

  // Spread across lines by weight so every VAT rate keeps a correct base.
  const { amount: documentDiscount, keptRatio } = resolveDocumentDiscount(
    linesSubtotal,
    input.discountPercent,
    input.discountAmount,
    input.currency
  );

  let taxAmount = 0;
  for (const { line, totals } of priced) {
    taxAmount += round(round(totals.subtotal * keptRatio) * (line.tax_rate / 100));
  }

  const subtotal = round(linesSubtotal - documentDiscount + shippingCost);
  taxAmount = round(taxAmount + round(shippingCost * (shippingTaxRate / 100)));

  return {
    subtotal,
    taxAmount,
    total: round(subtotal + taxAmount),
    linesSubtotal,
    documentDiscount,
  };
}

function clampPercent(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}
