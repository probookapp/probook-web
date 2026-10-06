import { DEFAULT_FISCAL_PROFILE, getFiscalProfile } from "./fiscal-profiles";

/**
 * Every currency decision the app makes, in one place.
 *
 * Codes used to be typed wherever a currency was needed — "DZD" as a fallback
 * here, "EUR" there, a four-entry list on one admin page and a different list
 * on the next, "MAD" printed on every fixed coupon. Each was a place where the
 * pricing stopped following the business. Anything that needs a currency now
 * asks this module, and the module answers from data: the catalogue, the
 * tenant's settings, the fiscal profile.
 */

/**
 * The currency the subscription catalogue is written in and every exchange
 * rate is read against (`CurrencyRate.perDzd`). Other currencies are reached
 * from it by rate or by a price typed by hand — never by assuming it.
 */
export const REFERENCE_CURRENCY = "DZD";

/** A business with no currency set yet gets the one its fiscal profile uses. */
export const DEFAULT_CURRENCY = getFiscalProfile(DEFAULT_FISCAL_PROFILE).defaultCurrency;

/** The currencies the app can name, quote and print. */
export const CURRENCIES = [
  { code: "EUR", label: "EUR - Euro (€)" },
  { code: "USD", label: "USD - US Dollar ($)" },
  { code: "GBP", label: "GBP - British Pound (£)" },
  { code: "DZD", label: "DZD - Dinar algérien (د.ج)" },
  { code: "MAD", label: "MAD - Dirham marocain (د.م.)" },
  { code: "TND", label: "TND - Dinar tunisien (د.ت)" },
  { code: "CAD", label: "CAD - Dollar canadien (CA$)" },
  { code: "CHF", label: "CHF - Franc suisse (CHF)" },
] as const;

export const CURRENCY_CODES: string[] = CURRENCIES.map((c) => c.code);

/** Select options for a currency field. */
export const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c.code, label: c.label }));

/**
 * The currency a visitor from a country expects to read prices in (ISO 3166-1
 * alpha-2). Only a preference: the catalogue is quoted in it when a price row
 * or a rate exists for it, and in the reference currency otherwise.
 */
const COUNTRY_CURRENCIES: Record<string, string> = {
  // North Africa
  DZ: "DZD", MA: "MAD", TN: "TND", LY: "LYD", EG: "EGP",
  // Eurozone
  FR: "EUR", DE: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", BE: "EUR",
  PT: "EUR", AT: "EUR", IE: "EUR", FI: "EUR", GR: "EUR", LU: "EUR",
  // USD
  US: "USD", PR: "USD", GU: "USD",
  // GBP
  GB: "GBP",
  // CAD
  CA: "CAD",
  // Gulf
  SA: "SAR", AE: "AED", QA: "QAR", KW: "KWD", BH: "BHD", OM: "OMR",
  // Other
  TR: "TRY", JP: "JPY", CN: "CNY", IN: "INR", BR: "BRL",
};

/** Asked of a country the table does not list: the most widely quoted currency. */
const INTERNATIONAL_CURRENCY = "USD";

export function currencyForCountry(country: string): string {
  return COUNTRY_CURRENCIES[country.toUpperCase()] ?? INTERNATIONAL_CURRENCY;
}
