import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { settingsApi } from "@/lib/api";
import {
  getFiscalProfile,
  vatRateOptions,
  type FiscalProfile,
  type IdentifierKey,
} from "@/lib/fiscal-profiles";

/**
 * The tenant's country fiscal regime (Algeria by default).
 *
 * Reads the same cached `company-settings` query the rest of the app uses, so
 * this costs nothing extra and updates as soon as the setting is saved.
 */
export function useFiscalProfile(): FiscalProfile {
  const { data } = useQuery({
    queryKey: ["company-settings"],
    queryFn: settingsApi.get,
  });
  return getFiscalProfile(data?.fiscal_profile);
}

export interface IdentifierFieldView {
  key: IdentifierKey;
  label: string;
  /** Compact label for tables and PDFs. */
  shortLabel: string;
}

/** Identifier inputs to render, already labelled for the current regime. */
export function useIdentifierFields(): IdentifierFieldView[] {
  const { t } = useTranslation("common");
  const profile = useFiscalProfile();
  return useMemo(
    () =>
      profile.identifiers.map((f) => ({
        key: f.key,
        label: t(f.labelKey),
        shortLabel: t(f.shortLabelKey),
      })),
    [profile, t]
  );
}

/**
 * VAT rates offered by the current regime. `current` is kept selectable so a
 * record created under another regime never has its rate silently reset.
 */
export function useVatRateOptions(current?: number | null) {
  const profile = useFiscalProfile();
  return useMemo(() => vatRateOptions(profile.id, current), [profile.id, current]);
}
