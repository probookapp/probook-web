/**
 * The legal mentions an invoice owes, decided by the tenant's fiscal profile.
 *
 * A free-text "legal mentions" field only protects the users who already know
 * the rules. Everything the law asks for and the data can answer is printed
 * here automatically, and what the data cannot answer is listed as a
 * compliance issue the user sees before sending the invoice.
 *
 * Algeria, décret exécutif n° 05-468 du 10 décembre 2005, art. 3 and 4:
 *   seller: name, address + phone, legal form and nature of the activity,
 *   share capital, RC, NIS, payment method and settlement date, number + date,
 *   lines, HT prices, taxes, total TTC in figures AND in words; buyer: name,
 *   legal form and activity, address, RC, NIS, a consumer only name + address;
 *   wet stamp and signature unless sent by telematic means (art. 4).
 * France, CGI annexe II art. 242 nonies A, Code de commerce L441-9 / D441-5:
 *   legal form and capital (or "EI"), the franchise mention when no VAT is
 *   charged under the franchise en base, and for business clients the
 *   late-penalty rate, the 40 € recovery indemnity and the early-payment
 *   discount terms.
 *
 * Nothing here formats or translates: mentions come back as i18n keys under
 * the `legal` section of pdf.json, so the PDF and the screens word them the
 * same way.
 */
import { getFiscalProfile, type FiscalProfileId } from "@/lib/fiscal-profiles";

/** Legal forms offered per regime. OTHER prints nothing. */
export const LEGAL_FORMS: Record<FiscalProfileId, readonly string[]> = {
  DZ: ["PP", "EURL", "SARL", "SPA", "SNC", "SCS", "OTHER"],
  FR: ["EI", "EURL", "SARL", "SAS", "SASU", "SA", "SNC", "OTHER"],
};

/** Forms of a natural person: no share capital to state. */
const PERSONAL_FORMS = new Set(["EI", "PP"]);

/** How the client is to settle an invoice. CREDIT is a POS-only notion. */
export const INVOICE_PAYMENT_METHODS = ["CASH", "CHEQUE", "TRANSFER", "CARD"] as const;
export type InvoicePaymentMethod = (typeof INVOICE_PAYMENT_METHODS)[number];

export function isInvoicePaymentMethod(value: unknown): value is InvoicePaymentMethod {
  return (
    typeof value === "string" &&
    (INVOICE_PAYMENT_METHODS as readonly string[]).includes(value)
  );
}

/** The ground of a 0 % line, outside the franchise (242 nonies A I.12°-13°). */
export const VAT_EXEMPTIONS = ["INTRA_EU", "EXPORT", "REVERSE_CHARGE", "OTHER"] as const;
export type VatExemption = (typeof VAT_EXEMPTIONS)[number];

/** What the invoice bills (242 nonies A I.8° bis): goods, services, or both. */
export const OPERATION_NATURES = ["GOODS", "SERVICES", "MIXED"] as const;
export type OperationNature = (typeof OPERATION_NATURES)[number];

/**
 * The nature of an invoice from its lines' products: true = a service,
 * false = goods, null = a free-text line nobody can classify. Any unknown
 * line leaves the question to the user rather than guessing.
 */
export function deriveOperationNature(isService: Array<boolean | null>): OperationNature | null {
  if (isService.length === 0 || isService.some((s) => s === null)) return null;
  if (isService.every((s) => s)) return "SERVICES";
  if (isService.every((s) => !s)) return "GOODS";
  return "MIXED";
}

export interface Mention {
  key: string;
  values?: Record<string, string | number>;
}

export interface MentionCompany {
  fiscal_profile?: string | null;
  company_name?: string | null;
  address?: string | null;
  siret?: string | null;
  vat_number?: string | null;
  nis?: string | null;
  legal_form?: string | null;
  share_capital?: number | null;
  activity?: string | null;
  vat_franchise?: boolean | null;
  late_penalty_rate?: string | null;
  early_payment_discount?: string | null;
  vat_on_debits?: boolean | null;
}

export interface MentionClient {
  is_consumer?: boolean | null;
  address?: string | null;
  siret?: string | null;
  nis?: string | null;
  legal_form?: string | null;
  activity?: string | null;
}

export interface MentionInvoice {
  payment_method?: string | null;
  operation_nature?: string | null;
  vat_exemption?: string | null;
  vat_exemption_note?: string | null;
  lines?: Array<{ tax_rate: number; is_subtotal_line?: boolean | null }>;
}

function filled(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** A legal-form code that prints, or null for none / OTHER / unknown. */
function printableForm(company: MentionCompany): string | null {
  const profile = getFiscalProfile(company.fiscal_profile);
  const code = company.legal_form;
  if (!code || code === "OTHER") return null;
  return LEGAL_FORMS[profile.id].includes(code) ? code : null;
}

/**
 * The company name as it must read on a document. A French individual
 * entrepreneur's name is "précédé ou suivi de la mention « Entrepreneur
 * individuel » ou « EI »" (Code de commerce R526-27).
 */
export function legalCompanyName(company: MentionCompany): string {
  const name = company.company_name ?? "";
  const profile = getFiscalProfile(company.fiscal_profile);
  if (profile.id === "FR" && company.legal_form === "EI" && !/\bEI\b/.test(name)) {
    return `${name} EI`;
  }
  return name;
}

/**
 * Lines printed under the seller's name: legal form with its capital, and the
 * nature of the activity. `money` formats the capital in the tenant currency.
 */
export function sellerMentions(
  company: MentionCompany,
  money: (amount: number) => string
): Mention[] {
  const out: Mention[] = [];
  const form = printableForm(company);
  // The EI mention already sits next to the name.
  if (form && form !== "EI") {
    const capital = Number(company.share_capital ?? 0);
    if (!PERSONAL_FORMS.has(form) && capital > 0) {
      out.push({ key: "legal.formWithCapital", values: { form, capital: money(capital) } });
    } else {
      out.push({ key: `legal.forms.${form}` });
    }
  }
  if (filled(company.activity)) {
    out.push({ key: "legal.activity", values: { activity: company.activity!.trim() } });
  }
  return out;
}

/** Same, for the buyer: legal form and activity of a business client. */
export function buyerMentions(client: MentionClient | null | undefined): Mention[] {
  if (!client || client.is_consumer) return [];
  const out: Mention[] = [];
  if (client.legal_form && client.legal_form !== "OTHER") {
    out.push({ key: `legal.forms.${client.legal_form}` });
  }
  if (filled(client.activity)) {
    out.push({ key: "legal.activity", values: { activity: client.activity!.trim() } });
  }
  return out;
}

/** Whether the invoice must state its total TTC in words (Algeria, art. 3). */
export function requiresAmountInWords(company: MentionCompany): boolean {
  return getFiscalProfile(company.fiscal_profile).id === "DZ";
}

/** Whether the printed invoice carries a stamp-and-signature box (Algeria, art. 4). */
export function requiresStampAndSignature(company: MentionCompany): boolean {
  return getFiscalProfile(company.fiscal_profile).id === "DZ";
}

function hasZeroRateLine(invoice: MentionInvoice | null | undefined): boolean {
  return (invoice?.lines ?? []).some((l) => !l.is_subtotal_line && Number(l.tax_rate) === 0);
}

/**
 * The automatic mentions at the foot of an invoice, before the tenant's own
 * free text.
 */
export function invoiceFooterMentions(
  company: MentionCompany,
  client: MentionClient | null | undefined,
  invoice?: MentionInvoice | null
): Mention[] {
  const profile = getFiscalProfile(company.fiscal_profile);
  const out: Mention[] = [];
  if (profile.id === "FR") {
    // Wording set by CGI art. 293 E. VAT moves from the CGI to the CIBS on
    // 1 January 2027 (ordonnance 2025-1247, date set by ordonnance 2026-671),
    // and CGI references stay accepted until 30 June 2028: switch the article
    // in pdf.json and facturx.ts once the CIBS article is published.
    if (company.vat_franchise) out.push({ key: "legal.fr.vatFranchise" });
    // The legal ground of a 0 % line outside the franchise.
    if (!company.vat_franchise && hasZeroRateLine(invoice) && invoice?.vat_exemption) {
      if (invoice.vat_exemption === "OTHER") {
        if (filled(invoice.vat_exemption_note)) {
          out.push({ key: "legal.fr.exemptionOther", values: { note: invoice.vat_exemption_note!.trim() } });
        }
      } else if ((VAT_EXEMPTIONS as readonly string[]).includes(invoice.vat_exemption)) {
        out.push({ key: `legal.fr.exemption.${invoice.vat_exemption}` });
      }
    }
    const nature = invoice?.operation_nature;
    if (nature && (OPERATION_NATURES as readonly string[]).includes(nature)) {
      out.push({ key: `legal.fr.operationNature.${nature}` });
    }
    // Only meaningful where services are billed: goods always owe VAT on delivery.
    if (company.vat_on_debits && !company.vat_franchise && nature !== "GOODS") {
      out.push({ key: "legal.fr.vatOnDebits" });
    }
    // L441-9: owed to professional buyers. A consumer can never be asked for
    // the 40 € indemnity, so printing it there would only mislead.
    if (!client?.is_consumer) {
      out.push(
        filled(company.late_penalty_rate)
          ? { key: "legal.fr.latePenalty", values: { rate: company.late_penalty_rate!.trim() } }
          : { key: "legal.fr.latePenaltyDefault" }
      );
      out.push({ key: "legal.fr.recoveryIndemnity" });
      out.push(
        filled(company.early_payment_discount)
          ? { key: "legal.fr.earlyDiscount", values: { terms: company.early_payment_discount!.trim() } }
          : { key: "legal.fr.earlyDiscountNone" }
      );
    }
  }
  return out;
}

export type ComplianceScope = "company" | "client" | "invoice";

export interface ComplianceIssue {
  scope: ComplianceScope;
  /** i18n key under `legalCompliance.issues` in settings.json. */
  key: string;
}

/** What the company settings lack for invoices to be compliant. */
export function companyComplianceIssues(company: MentionCompany): ComplianceIssue[] {
  const profile = getFiscalProfile(company.fiscal_profile);
  const issues: ComplianceIssue[] = [];
  const add = (key: string) => issues.push({ scope: "company", key });
  if (!filled(company.company_name)) add("companyName");
  if (!filled(company.address)) add("companyAddress");
  const form = company.legal_form;
  if (!form) add("companyLegalForm");
  const isCompany = !!form && form !== "OTHER" && !PERSONAL_FORMS.has(form);
  if (profile.id === "DZ") {
    if (!filled(company.siret)) add("companyRc");
    if (!filled(company.nis)) add("companyNis");
    if (!filled(company.vat_number)) add("companyNif");
    if (!filled(company.activity)) add("companyActivity");
    if (isCompany && !(Number(company.share_capital ?? 0) > 0)) add("companyCapital");
  } else {
    if (!filled(company.siret)) add("companySiret");
    if (!company.vat_franchise && !filled(company.vat_number)) add("companyVatNumber");
    if (isCompany && !(Number(company.share_capital ?? 0) > 0)) add("companyCapital");
  }
  return issues;
}

/** What one invoice (and its client) lack, on top of the company's issues. */
export function invoiceComplianceIssues(
  company: MentionCompany,
  client: MentionClient | null | undefined,
  invoice: MentionInvoice
): ComplianceIssue[] {
  const profile = getFiscalProfile(company.fiscal_profile);
  const issues: ComplianceIssue[] = [];
  if (client) {
    if (!filled(client.address)) issues.push({ scope: "client", key: "clientAddress" });
    if (profile.id === "DZ" && !client.is_consumer) {
      if (!filled(client.siret)) issues.push({ scope: "client", key: "clientRc" });
      if (!filled(client.nis)) issues.push({ scope: "client", key: "clientNis" });
      if (!client.legal_form) issues.push({ scope: "client", key: "clientLegalForm" });
      if (!filled(client.activity)) issues.push({ scope: "client", key: "clientActivity" });
    }
  }
  if (profile.id === "DZ" && !isInvoicePaymentMethod(invoice.payment_method)) {
    issues.push({ scope: "invoice", key: "invoicePaymentMethod" });
  }
  // A 0 % line outside the franchise is an exemption, and an exemption must
  // name its legal ground (242 nonies A I.12°), something only the user knows.
  if (profile.id === "FR" && !company.vat_franchise && hasZeroRateLine(invoice)) {
    const ground = invoice.vat_exemption;
    const named =
      !!ground &&
      (VAT_EXEMPTIONS as readonly string[]).includes(ground) &&
      (ground !== "OTHER" || filled(invoice.vat_exemption_note));
    if (!named) issues.push({ scope: "invoice", key: "invoiceExemptionGround" });
  }
  if (profile.id === "FR") {
    // E-invoicing mentions: the nature of the operations, and the business
    // client's SIREN (mandatory for SMEs from 1 September 2027).
    if (!invoice.operation_nature || !(OPERATION_NATURES as readonly string[]).includes(invoice.operation_nature)) {
      issues.push({ scope: "invoice", key: "invoiceOperationNature" });
    }
    if (client && !client.is_consumer && !filled(client.siret)) {
      issues.push({ scope: "client", key: "clientSiren" });
    }
  }
  // The franchise mention says no VAT is charged; a taxed line contradicts it.
  if (
    profile.id === "FR" &&
    company.vat_franchise &&
    (invoice.lines ?? []).some((l) => !l.is_subtotal_line && Number(l.tax_rate) > 0)
  ) {
    issues.push({ scope: "invoice", key: "invoiceVatUnderFranchise" });
  }
  return issues;
}
