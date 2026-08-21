/** A name the platform admin can spell differently per language. */
export type Translations = Record<string, string> | null | undefined;

/**
 * The name to show for a plan or a feature, in the reader's language.
 *
 * Offers and entitlements are rows a platform admin writes, not strings in a
 * bundle, so they cannot go through i18next. Their base name is English and
 * `nameTranslations` carries the rest; an admin who adds an offer without
 * translating it gets the English name everywhere, which is the right failure —
 * a visible name rather than a blank.
 *
 * Two screens had their own copy of this and a third was about to. One rule.
 */
export function translatedName(
  base: string | null,
  translations: Translations,
  locale: string
): string {
  if (locale !== "en" && translations && translations[locale]) {
    return translations[locale];
  }
  return base || "";
}
