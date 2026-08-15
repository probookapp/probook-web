import fr from "@/i18n/locales/fr/pdf.json";
import en from "@/i18n/locales/en/pdf.json";
import { documentLocale, type DocumentLocale } from "./text";

/**
 * The words printed on a document, read straight from the bundles.
 *
 * Not through `@/i18n`: that module wires up react-i18next, which calls
 * `React.createContext` the moment it is imported. A route handler resolves
 * `react` to Next's server build, where that function does not exist — so
 * importing a PDF component from the server answered
 * "createContext is not a function" before a single byte was rendered.
 *
 * Only the languages a document can actually be printed in are loaded, which
 * is the same list the barrier guards: Helvetica has no Arabic glyphs, and
 * pdfkit prints a truncated byte instead of refusing.
 */
const BUNDLES: Record<DocumentLocale, unknown> = { fr, en };

export function pdfString(
  key: string,
  locale: string,
  values?: Record<string, string | number>
): string {
  const lang = documentLocale(locale);
  let node: unknown = BUNDLES[lang];
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return key;
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node !== "string") return key;
  if (!values) return node;
  // Same {{name}} placeholders as the bundles use everywhere else.
  return node.replace(/\{\{(\w+)\}\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole
  );
}
