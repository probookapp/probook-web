import {
  ARABIC_CURRENCY_WORDS,
  CURRENCY_WORDS,
  numberToArabicWords,
  numberToFrenchWords,
} from "@/lib/number-words";
import { currencyMinorUnits } from "@/lib/money";

/**
 * The total written out on a document, in a language the line can be read in.
 *
 * French and Arabic each have their own writer. English has none, and a
 * French sentence on an English document is worse than nothing, so English
 * documents carry the line only when the law requires it (Algerian invoices,
 * decree 05-468 art. 3), and then in French, label included, so it stays one
 * coherent sentence. `labelLocale` says which language the label is in.
 */
export function documentAmountInWords(
  amount: number,
  currency: string,
  locale: string,
  mandatory: boolean
): { labelLocale: string; text: string } | null {
  const minor = currencyMinorUnits(currency);
  if (locale === "ar") {
    const words = ARABIC_CURRENCY_WORDS[currency] ?? { main: currency, sub: "" };
    return { labelLocale: "ar", text: numberToArabicWords(amount, words.main, words.sub, minor) };
  }
  if (locale === "fr" || mandatory) {
    const words = CURRENCY_WORDS[currency] ?? { main: currency.toLowerCase(), sub: "centime" };
    return { labelLocale: "fr", text: numberToFrenchWords(amount, words.main, words.sub, minor) };
  }
  return null;
}
