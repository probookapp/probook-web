import { formatCurrency } from "@/lib/utils";

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

/** `formatCurrency`, rendered so a PDF reader can actually print it. */
export function pdfCurrency(amount: number | null | undefined): string {
  return pdfSafe(formatCurrency(amount));
}
