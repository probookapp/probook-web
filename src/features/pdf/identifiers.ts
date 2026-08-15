import { commonString } from "./strings";
import { identifierFields } from "@/lib/fiscal-profiles";
import type { Client, CompanySettings } from "@/types";

/** Anything carrying the shared identifier columns: the tenant or a client. */
type IdentifierHolder = Pick<Client, "siret" | "vat_number" | "nis" | "art">;

export interface RenderedIdentifier {
  label: string;
  value: string;
}

/**
 * The identifiers to print for a party, labelled for the tenant's fiscal
 * regime (NIF / RC / NIS / article in Algeria, SIRET / N° TVA in France) and
 * limited to the ones actually filled in.
 */
export function renderIdentifiers(
  company: Pick<CompanySettings, "fiscal_profile">,
  party: IdentifierHolder | null | undefined,
  locale = "fr"
): RenderedIdentifier[] {
  if (!party) return [];
  return identifierFields(company.fiscal_profile)
    .map((field) => ({
      label: commonString(field.shortLabelKey, locale),
      value: party[field.key] ?? "",
    }))
    .filter((entry): entry is RenderedIdentifier => entry.value.trim().length > 0);
}

/** Same list, flattened for a one-line footer: "NIF: x - RC: y". */
export function identifierSummary(
  company: Pick<CompanySettings, "fiscal_profile">,
  party: IdentifierHolder | null | undefined,
  locale = "fr"
): string {
  return renderIdentifiers(company, party, locale)
    .map((entry) => `${entry.label}: ${entry.value}`)
    .join(" - ");
}
