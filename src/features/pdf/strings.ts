import fr from "@/i18n/locales/fr/pdf.json";
import en from "@/i18n/locales/en/pdf.json";
import ar from "@/i18n/locales/ar/pdf.json";
import frCommon from "@/i18n/locales/fr/common.json";
import enCommon from "@/i18n/locales/en/common.json";
import arCommon from "@/i18n/locales/ar/common.json";


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
// Arabic is loaded too: the server route can print it, even though the
// browser preview cannot (see SERVER_DOCUMENT_LOCALES).
const BUNDLES: Record<string, unknown> = { fr, en, ar };

/** The shared namespace, for the few document labels that live there. */
const COMMON: Record<string, unknown> = { fr: frCommon, en: enCommon, ar: arCommon };

/**
 * `locale` is an already-resolved document language, never an interface one.
 *
 * Resolving it here would have to pick a set — what the browser can print, or
 * what the server can — and picking the wrong one is how an Arabic preview
 * would go back to printing nonsense. The caller knows which side it is on.
 */
export function pdfString(
  key: string,
  locale: string,
  values?: Record<string, string | number>
): string {
  const lang = locale in BUNDLES ? locale : "fr";
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

/** A `common:` key, same rules as pdfString. */
export function commonString(key: string, locale: string): string {
  const lang = locale in COMMON ? locale : "fr";
  let node: unknown = COMMON[lang];
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return key;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : key;
}
