// Droit de timbre (Algerian stamp duty) computation.
//
// Business rules (all values come from CompanySettings — nothing is hard-coded,
// so they can follow regulation changes):
//   - Applies ONLY to cash-settled invoices (isCashSale).
//   - Applies ONLY when the TTC total reaches the configured threshold.
//   - Computed AFTER the TTC total: stampDuty = round2(total * rate%).
//   - Never applies to drafts, and never when the feature is disabled.
//   - It is a surcharge on the amount to pay, NOT part of revenue or VAT.

export interface StampDutyContext {
  enabled?: boolean | null;
  /** Percentage, e.g. 1 for 1%. Configurable in settings. */
  rate?: number | null;
  /** Minimum TTC total for the timbre to apply. Configurable in settings. */
  threshold?: number | null;
  /** Whether this specific invoice is settled in cash. */
  isCashSale: boolean;
  /** Legal exemption on this operation: no timbre even when cash. */
  exempt?: boolean;
  /** TTC total the timbre is computed from (includes shipping). */
  total: number;
  /** Drafts never carry timbre. */
  isDraft?: boolean;
}

export function computeStampDuty(ctx: StampDutyContext): number {
  if (ctx.isDraft) return 0;
  if (!ctx.enabled) return 0;
  if (ctx.exempt) return 0;
  if (!ctx.isCashSale) return 0;
  if (ctx.total < (ctx.threshold ?? 0)) return 0;
  return Math.round(ctx.total * ((ctx.rate ?? 0) / 100) * 100) / 100;
}
