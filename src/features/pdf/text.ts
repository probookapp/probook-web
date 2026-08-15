import { useSettingsStore } from "@/stores/useSettingsStore";

/**
 * Text on its way into a PDF.
 *
 * The documents are set in Helvetica, one of the fourteen fonts every PDF
 * reader carries. It is encoded in WinAnsi, which has no room for the
 * typographic spaces `Intl` produces — and pdfkit does not fail on a character
 * it cannot encode: it truncates the code point to its low byte and prints
 * whatever lands there. U+202F, the narrow no-break space French uses between
 * thousands, becomes 0x2F. That is a slash.
 *
 * So every invoice, quote and report went out reading "42/000,00DZD" instead of
 * "42 000,00 DZD" — on documents sent to clients. Nothing failed; the amounts
 * were simply wrong on paper.
 *
 * Plain spaces are the only safe answer here. They allow a line break where a
 * no-break space would not, which is a real loss on screen — and exactly why
 * this normalisation lives at the PDF boundary rather than inside
 * `formatCurrency`, where it would degrade the interface to fix the print.
 */

/** Spaces WinAnsi cannot represent, and the one it can. */
const UNSAFE_SPACES = /[\u00A0\u2000-\u200B\u202F\u205F\u2060\u3000\uFEFF]/g;

/** Direction marks Arabic and Hebrew locales insert; meaningless once printed. */
const BIDI_MARKS = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

export function pdfSafe(text: string): string {
  return text.replace(BIDI_MARKS, "").replace(UNSAFE_SPACES, " ");
}

/**
 * Money, formatted in the document's language and printable by the reader.
 *
 * Not `formatCurrency`: that one follows the interface, so a French document
 * opened from an Arabic session would carry Arabic grouping. The document is
 * one artefact in one language, separators included.
 */
export function pdfCurrency(
  amount: number | null | undefined,
  uiLanguage = "fr"
): string {
  const safe = typeof amount === "number" && !Number.isNaN(amount) ? amount : 0;
  const currency = useSettingsStore.getState().currency || "DZD";
  const locale = documentLocale(uiLanguage) === "en" ? "en-US" : "fr-FR";
  return pdfSafe(
    new Intl.NumberFormat(locale, { style: "currency", currency }).format(safe)
  );
}

/**
 * Languages a document may be printed in.
 *
 * Arabic is missing on purpose. Helvetica has no Arabic glyphs, and pdfkit
 * prints a truncated byte rather than refusing: an Arabic invoice came out with
 * every label replaced by Latin nonsense — "الوصف" as "A5HD'". Adding "ar" here
 * without an embedded Arabic face puts an unreadable document in a client's
 * hands, so the barrier in pdf-text.test.ts checks each entry can actually be
 * encoded.
 */
export const DOCUMENT_LOCALES = ["fr", "en"] as const;
export type DocumentLocale = (typeof DOCUMENT_LOCALES)[number];

/**
 * The language a document prints in, given the language of the interface.
 *
 * An Arabic interface prints French documents. In Algeria that is the ordinary
 * case rather than a compromise: invoices are commonly issued in French, which
 * is the language of commerce and of the tax administration. The alternative,
 * today, is an unreadable invoice.
 */
export function documentLocale(uiLanguage: string): DocumentLocale {
  const lang = (uiLanguage || "fr").split("-")[0];
  return (DOCUMENT_LOCALES as readonly string[]).includes(lang)
    ? (lang as DocumentLocale)
    : "fr";
}
