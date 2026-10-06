/**
 * A catalogue price as the visitor reads it, from centimes.
 *
 * French grouping for the French and Arabic pages — "19 000 DZD" is how the
 * figure is written in Algeria and in France, where "19,000" reads as nineteen
 * with three decimals. Latin digits throughout, as on the rest of the app.
 */
const NUMBER_LOCALES: Record<string, string> = {
  fr: "fr-FR",
  ar: "fr-FR",
  en: "en-US",
};

export function formatPriceTag(
  centimes: number,
  currency: string,
  locale: string,
  options: {
    /**
     * Round to the whole unit: for a figure derived from a whole price, such
     * as a yearly price spread over twelve months (19 000 / 12 = 1 583.33).
     */
    whole?: boolean;
  } = {}
): string {
  const amount = centimes / 100;
  // Decimals only where the price has them — decided by the figure, never by
  // the currency's name, so every currency the catalogue is quoted in reads
  // the same way: 19 000 DZD, 132 EUR, 199,99 USD.
  const digits = options.whole || Number.isInteger(amount) ? 0 : 2;
  const figure = amount.toLocaleString(NUMBER_LOCALES[locale] ?? "fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${figure} ${currency}`;
}

/**
 * The whole months the yearly cycle gives away on every offer, or 0 when it
 * does not give a full month on all of them.
 *
 * Computed from the prices rather than written into the badge, so the claim
 * stays true when a price changes: the smallest saving is the one every offer
 * can honour.
 */
export function yearlyMonthsFree(
  plans: { monthly_price: number; yearly_price: number }[] | undefined
): number {
  const savings = (plans ?? [])
    .filter((p) => p.monthly_price > 0 && p.yearly_price > 0)
    .map((p) => (12 * p.monthly_price - p.yearly_price) / p.monthly_price);
  if (savings.length === 0) return 0;
  // The epsilon absorbs float noise on prices that divide exactly.
  return Math.max(0, Math.floor(Math.min(...savings) + 1e-9));
}
