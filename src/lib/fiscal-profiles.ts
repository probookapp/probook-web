/**
 * Country fiscal regimes.
 *
 * Probook's primary market is Algeria, so a new tenant starts on the Algerian
 * regime. France stays fully available: the profile is a tenant setting, and
 * switching it changes the VAT scale offered, the identifier labels and whether
 * the droit de timbre applies — it never rewrites stored data.
 *
 * Identifiers share their storage across profiles, one column per concept:
 *   `siret`      the company registration number   → RC   (DZ) / SIRET (FR)
 *   `vat_number` the tax identification number     → NIF  (DZ) / N° TVA (FR)
 *   `nis`, `art` Algerian-only, hidden under FR
 */

export const FISCAL_PROFILE_IDS = ["DZ", "FR"] as const;
export type FiscalProfileId = (typeof FISCAL_PROFILE_IDS)[number];

/** Storage keys, in the API's snake_case shape. */
export type IdentifierKey = "siret" | "vat_number" | "nis" | "art";

export interface IdentifierField {
  key: IdentifierKey;
  /** i18n key under the `common` namespace, e.g. "identifiers.nif". */
  labelKey: string;
  /** Compact form used on PDFs and in tables, e.g. "identifiersShort.nif". */
  shortLabelKey: string;
}

export interface FiscalProfile {
  id: FiscalProfileId;
  labelKey: string;
  defaultCurrency: string;
  defaultTaxRate: number;
  /** VAT rates offered in dropdowns, ascending. */
  vatRates: number[];
  /** Identifier fields to show, in display order. */
  identifiers: IdentifierField[];
  /** Whether the droit de timbre (Algerian stamp duty) applies. */
  hasStampDuty: boolean;
}

export const FISCAL_PROFILES: Record<FiscalProfileId, FiscalProfile> = {
  DZ: {
    id: "DZ",
    labelKey: "fiscalProfiles.DZ",
    defaultCurrency: "DZD",
    defaultTaxRate: 19,
    vatRates: [0, 9, 19],
    identifiers: [
      { key: "vat_number", labelKey: "identifiers.nif", shortLabelKey: "identifiersShort.nif" },
      { key: "siret", labelKey: "identifiers.rc", shortLabelKey: "identifiersShort.rc" },
      { key: "nis", labelKey: "identifiers.nis", shortLabelKey: "identifiersShort.nis" },
      { key: "art", labelKey: "identifiers.art", shortLabelKey: "identifiersShort.art" },
    ],
    hasStampDuty: true,
  },
  FR: {
    id: "FR",
    labelKey: "fiscalProfiles.FR",
    defaultCurrency: "EUR",
    defaultTaxRate: 20,
    vatRates: [0, 2.1, 5.5, 10, 20],
    identifiers: [
      { key: "siret", labelKey: "identifiers.siret", shortLabelKey: "identifiersShort.siret" },
      {
        key: "vat_number",
        labelKey: "identifiers.vatNumber",
        shortLabelKey: "identifiersShort.vatNumber",
      },
    ],
    hasStampDuty: false,
  },
};

export const DEFAULT_FISCAL_PROFILE: FiscalProfileId = "DZ";

export function isFiscalProfileId(value: unknown): value is FiscalProfileId {
  return (
    typeof value === "string" && (FISCAL_PROFILE_IDS as readonly string[]).includes(value)
  );
}

/** Never throws — an unknown or missing value falls back to the default regime. */
export function getFiscalProfile(id?: string | null): FiscalProfile {
  return FISCAL_PROFILES[isFiscalProfileId(id) ? id : DEFAULT_FISCAL_PROFILE];
}

/**
 * VAT rates for a dropdown. `current` is always kept selectable so editing a
 * record created under another regime never silently resets its rate.
 */
export function vatRateOptions(
  profileId: string | null | undefined,
  current?: number | null
): { value: string; label: string }[] {
  const rates = [...getFiscalProfile(profileId).vatRates];
  if (typeof current === "number" && Number.isFinite(current) && !rates.includes(current)) {
    rates.push(current);
  }
  return rates
    .sort((a, b) => a - b)
    .map((rate) => ({ value: String(rate), label: `${rate}%` }));
}

/** The identifier fields to render for a profile, in display order. */
export function identifierFields(profileId?: string | null): IdentifierField[] {
  return getFiscalProfile(profileId).identifiers;
}
