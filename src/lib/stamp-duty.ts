// Droit de timbre (Algerian stamp duty) computation.
//
// Business rules:
//   - Applies ONLY to cash-settled operations (isCashSale); electronic payments
//     are exempt by law (art. 258 quinquies), which the isCashSale gate covers.
//   - Never applies to drafts, exempt operations, or when the feature is disabled.
//   - It is a surcharge on the amount to pay, NOT part of revenue or VAT.
//
// Rate scale (Loi de Finances 2025, art. 100-I of the Code du Timbre) — a
// PROGRESSIVE scale by the bracket the TTC total falls into, computed per started
// 100 DA fraction, minimum 5 DA, no maximum:
//   ≤ 300 DA         → exempt
//   301 – 30 000     → 1%   (1 DA per 100)
//   30 001 – 100 000 → 1.5% (1.5 DA per 100)
//   > 100 000        → 2%   (2 DA per 100)
//
// NOTE: implements the "bracket rate applied to the whole total" reading. If an
// accountant confirms the marginal (per-slice) reading, adjust computeTimbreScale.

export interface StampDutyContext {
  enabled?: boolean | null;
  /** @deprecated Superseded by the legal progressive scale; ignored. */
  rate?: number | null;
  /** Optional business floor below which the timbre isn't charged (on top of the legal ≤300 exemption). */
  threshold?: number | null;
  /** Whether this specific operation is settled in cash. */
  isCashSale: boolean;
  /** Legal exemption on this operation: no timbre even when cash. */
  exempt?: boolean;
  /** TTC total the timbre is computed from (includes shipping). */
  total: number;
  /** Drafts never carry timbre. */
  isDraft?: boolean;
}

/** Rate (DA per 100 DA) fixed by the bracket the total falls in. */
function ratePerHundred(total: number): number {
  if (total <= 300) return 0;
  if (total <= 30000) return 1;
  if (total <= 100000) return 1.5;
  return 2;
}

/**
 * The legal droit de timbre for a TTC total, per the progressive scale: rate of
 * the total's bracket applied per started 100 DA fraction, minimum 5 DA. Returns
 * 0 for exempt amounts (≤ 300 DA).
 */
export function computeTimbreScale(total: number): number {
  const rate = ratePerHundred(total);
  if (rate <= 0) return 0;
  const fractions = Math.ceil(total / 100); // each started 100 DA counts
  const duty = fractions * rate;
  return Math.max(5, Math.round(duty * 1000) / 1000);
}

export function computeStampDuty(ctx: StampDutyContext): number {
  if (ctx.isDraft) return 0;
  if (!ctx.enabled) return 0;
  if (ctx.exempt) return 0;
  if (!ctx.isCashSale) return 0;
  // Optional business floor (kept for backward compatibility). The legal ≤300 DA
  // exemption is enforced by the scale itself.
  if (ctx.total < (ctx.threshold ?? 0)) return 0;
  return computeTimbreScale(ctx.total);
}

/**
 * What a new invoice assumes about how it will be settled.
 *
 * Nobody knows at issue time how a client will actually pay, so this is a
 * declaration the user can change, not a fact. It defaults to a cash sale
 * because that is the ordinary case in the market this is built for, and
 * because the two ways of being wrong are not symmetrical: charging a timbre
 * that was not due is visible on the document and refundable, while omitting
 * one leaves the business owing a tax it never collected.
 *
 * It exists because the form and the API disagreed — the invoice screen
 * defaulted to true, the API to false. The same shop got a timbre on the
 * documents it typed and none on the ones its imports, its integrations or its
 * offline queue replayed, with nothing to show for the difference.
 */
export const DEFAULT_IS_CASH_SALE = true;
