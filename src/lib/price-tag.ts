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

export function formatPriceTag(centimes: number, currency: string, locale: string): string {
  const amount = centimes / 100;
  // The dinar is not written with decimals, and a yearly price spread over
  // twelve months rarely falls on a whole one (19,000 / 12 = 1,583.33).
  const digits = currency === "DZD" ? 0 : 2;
  const figure = amount.toLocaleString(NUMBER_LOCALES[locale] ?? "fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${figure} ${currency}`;
}
