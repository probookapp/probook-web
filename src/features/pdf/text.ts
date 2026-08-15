
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
  documentLanguage = "fr",
  currency = "DZD"
): string {
  const safe = typeof amount === "number" && !Number.isNaN(amount) ? amount : 0;
  // Passed in, not read from the settings store: that store imports the client
  // i18n instance, and anything importing it cannot be rendered on the server.
  // It also means a server render uses the tenant's currency rather than a
  // default that happens to be right most of the time.
  const locale = documentLanguage === "en" ? "en-US" : "fr-FR";
  return pdfSafe(
    new Intl.NumberFormat(locale, { style: "currency", currency }).format(safe)
  );
}

/**
 * Languages a document may be printed in.
 *
 * All three, now that the faces are embedded rather than borrowed from the
 * reader. Before that, Arabic was impossible: Helvetica — one of the fourteen
 * every PDF reader carries — has no Arabic glyphs, and pdfkit prints a
 * truncated byte instead of refusing, so an invoice came out reading "A5HD'"
 * where "الوصف" belonged.
 *
 * Adding a language here means adding its face to public/fonts and registering
 * it on both sides; the barrier in pdf-text.test.ts checks the files exist,
 * because a face registered without its files does not fall back — the render
 * simply never finishes.
 */
export const DOCUMENT_LOCALES = ["fr", "en", "ar"] as const;
export type DocumentLocale = (typeof DOCUMENT_LOCALES)[number];

/**
 * Kept as an alias while both hosts exist. The browser renders what the
 * interface shows; the route under app/api renders documents the server
 * originates. Same components, same faces — one definition, two hosts.
 */
export const SERVER_DOCUMENT_LOCALES = DOCUMENT_LOCALES;
export type AnyDocumentLocale = DocumentLocale;

export function documentLocale(
  uiLanguage: string,
  allowed: readonly string[] = DOCUMENT_LOCALES
): DocumentLocale {
  const lang = (uiLanguage || "fr").split("-")[0];
  return allowed.includes(lang) ? (lang as DocumentLocale) : "fr";
}
