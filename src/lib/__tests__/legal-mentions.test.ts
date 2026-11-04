import { describe, expect, it } from "vitest";
import {
  buyerMentions,
  companyComplianceIssues,
  deriveOperationNature,
  invoiceComplianceIssues,
  invoiceFooterMentions,
  legalCompanyName,
  requiresAmountInWords,
  requiresStampAndSignature,
  sellerMentions,
} from "../legal-mentions";

const money = (n: number) => `${n} DA`;
const keys = (list: Array<{ key: string }>) => list.map((m) => m.key);

describe("Algeria (decree 05-468)", () => {
  const company = {
    fiscal_profile: "DZ",
    company_name: "Numidia",
    address: "Alger",
    siret: "RC",
    nis: "NIS",
    vat_number: "NIF",
    legal_form: "SARL",
    share_capital: 100000,
    activity: "Commerce de gros",
  };

  it("prints the legal form with its capital and the activity under the name", () => {
    expect(sellerMentions(company, money)).toEqual([
      { key: "legal.formWithCapital", values: { form: "SARL", capital: "100000 DA" } },
      { key: "legal.activity", values: { activity: "Commerce de gros" } },
    ]);
  });

  it("states no capital for a natural person", () => {
    expect(keys(sellerMentions({ ...company, legal_form: "PP" }, money))).toEqual([
      "legal.forms.PP",
      "legal.activity",
    ]);
  });

  it("always asks for the total in words and a stamp-and-signature box", () => {
    expect(requiresAmountInWords(company)).toBe(true);
    expect(requiresStampAndSignature(company)).toBe(true);
  });

  it("adds no French clauses at the foot", () => {
    expect(invoiceFooterMentions(company, null)).toEqual([]);
  });

  it("is compliant once every company field is filled", () => {
    expect(companyComplianceIssues(company)).toEqual([]);
  });

  it("lists what the company lacks", () => {
    expect(keys(companyComplianceIssues({ fiscal_profile: "DZ", company_name: "X" }))).toEqual([
      "companyAddress",
      "companyLegalForm",
      "companyRc",
      "companyNis",
      "companyNif",
      "companyActivity",
    ]);
    expect(keys(companyComplianceIssues({ ...company, share_capital: 0 }))).toEqual(["companyCapital"]);
  });

  it("asks a business client for RC, NIS, form and activity, a consumer only for an address", () => {
    const business = { address: "Oran" };
    expect(keys(invoiceComplianceIssues(company, business, { payment_method: "CASH" }))).toEqual([
      "clientRc",
      "clientNis",
      "clientLegalForm",
      "clientActivity",
    ]);
    expect(
      invoiceComplianceIssues(company, { is_consumer: true, address: "Oran" }, { payment_method: "CASH" })
    ).toEqual([]);
  });

  it("requires the payment method", () => {
    expect(keys(invoiceComplianceIssues(company, null, { payment_method: null }))).toEqual([
      "invoicePaymentMethod",
    ]);
    expect(keys(invoiceComplianceIssues(company, null, { payment_method: "BITCOIN" }))).toEqual([
      "invoicePaymentMethod",
    ]);
  });

  it("prints a business client's form and activity, nothing for a consumer", () => {
    expect(keys(buyerMentions({ legal_form: "EURL", activity: "BTP" }))).toEqual([
      "legal.forms.EURL",
      "legal.activity",
    ]);
    expect(buyerMentions({ is_consumer: true, legal_form: "EURL" })).toEqual([]);
  });
});

describe("France", () => {
  const company = {
    fiscal_profile: "FR",
    company_name: "Atelier",
    address: "Lyon",
    siret: "123",
    vat_number: "FR00123",
    legal_form: "SAS",
    share_capital: 1000,
  };

  it("prints the B2B late-payment clauses with their legal defaults", () => {
    expect(keys(invoiceFooterMentions(company, { is_consumer: false }))).toEqual([
      "legal.fr.latePenaltyDefault",
      "legal.fr.recoveryIndemnity",
      "legal.fr.earlyDiscountNone",
    ]);
  });

  it("uses the tenant's own rate and discount terms when set", () => {
    const mentions = invoiceFooterMentions(
      { ...company, late_penalty_rate: "12,40 %", early_payment_discount: "2 % à 10 jours" },
      null
    );
    expect(mentions).toContainEqual({ key: "legal.fr.latePenalty", values: { rate: "12,40 %" } });
    expect(mentions).toContainEqual({ key: "legal.fr.earlyDiscount", values: { terms: "2 % à 10 jours" } });
  });

  it("spares a consumer the B2B clauses", () => {
    expect(invoiceFooterMentions(company, { is_consumer: true })).toEqual([]);
  });

  it("states the franchise en base", () => {
    expect(keys(invoiceFooterMentions({ ...company, vat_franchise: true }, { is_consumer: true }))).toEqual([
      "legal.fr.vatFranchise",
    ]);
  });

  it("marks an individual entrepreneur's name with EI, once", () => {
    expect(legalCompanyName({ ...company, company_name: "Jean Dupont", legal_form: "EI" })).toBe("Jean Dupont EI");
    expect(legalCompanyName({ ...company, company_name: "Jean Dupont EI", legal_form: "EI" })).toBe("Jean Dupont EI");
    expect(legalCompanyName(company)).toBe("Atelier");
    expect(sellerMentions({ ...company, legal_form: "EI" }, money)).toEqual([]);
  });

  it("does not ask a franchise business for a VAT number", () => {
    expect(companyComplianceIssues({ ...company, vat_number: null, vat_franchise: true })).toEqual([]);
    expect(keys(companyComplianceIssues({ ...company, vat_number: null }))).toEqual(["companyVatNumber"]);
  });

  it("asks for the exemption ground of a 0 % line outside the franchise", () => {
    const lines = [{ tax_rate: 0 }];
    const base = { operation_nature: "GOODS" };
    expect(keys(invoiceComplianceIssues(company, null, { ...base, lines }))).toEqual(["invoiceExemptionGround"]);
    expect(invoiceComplianceIssues(company, null, { ...base, lines, vat_exemption: "INTRA_EU" })).toEqual([]);
    expect(keys(invoiceComplianceIssues(company, null, { ...base, lines, vat_exemption: "OTHER" }))).toEqual([
      "invoiceExemptionGround",
    ]);
    expect(
      invoiceComplianceIssues(company, null, { ...base, lines, vat_exemption: "OTHER", vat_exemption_note: "Art. 261 4 4° du CGI" })
    ).toEqual([]);
    expect(invoiceComplianceIssues({ ...company, vat_franchise: true }, null, { ...base, lines })).toEqual([]);
    expect(keys(invoiceComplianceIssues({ ...company, vat_franchise: true }, null, { operation_nature: "GOODS", lines: [{ tax_rate: 20 }] }))).toEqual([
      "invoiceVatUnderFranchise",
    ]);
    expect(
      invoiceComplianceIssues(company, null, { operation_nature: "GOODS", lines: [{ tax_rate: 0, is_subtotal_line: true }] })
    ).toEqual([]);
  });

  it("never asks for the Algerian mentions", () => {
    expect(requiresAmountInWords(company)).toBe(false);
    expect(requiresStampAndSignature(company)).toBe(false);
    expect(
      invoiceComplianceIssues(company, { address: "Paris", siret: "123" }, { payment_method: null, operation_nature: "MIXED" })
    ).toEqual([]);
  });

  it("asks for the nature of the operations and a business client's SIREN", () => {
    expect(keys(invoiceComplianceIssues(company, { address: "Paris" }, {}))).toEqual([
      "invoiceOperationNature",
      "clientSiren",
    ]);
    expect(invoiceComplianceIssues(company, { address: "Paris", is_consumer: true }, { operation_nature: "SERVICES" })).toEqual([]);
  });

  it("prints the exemption ground, the nature and the débits option", () => {
    const lines = [{ tax_rate: 0 }];
    expect(
      keys(
        invoiceFooterMentions({ ...company, vat_on_debits: true }, { is_consumer: true }, {
          lines,
          vat_exemption: "EXPORT",
          operation_nature: "MIXED",
        })
      )
    ).toEqual(["legal.fr.exemption.EXPORT", "legal.fr.operationNature.MIXED", "legal.fr.vatOnDebits"]);
    // Goods only: the débits option has nothing to say.
    expect(
      keys(invoiceFooterMentions({ ...company, vat_on_debits: true }, { is_consumer: true }, { operation_nature: "GOODS" }))
    ).toEqual(["legal.fr.operationNature.GOODS"]);
    expect(
      invoiceFooterMentions(company, { is_consumer: true }, { lines, vat_exemption: "OTHER", vat_exemption_note: "Art. 261" })
    ).toEqual([{ key: "legal.fr.exemptionOther", values: { note: "Art. 261" } }]);
  });

  it("derives the nature from the lines' products, never guessing a free line", () => {
    expect(deriveOperationNature([true, true])).toBe("SERVICES");
    expect(deriveOperationNature([false])).toBe("GOODS");
    expect(deriveOperationNature([true, false])).toBe("MIXED");
    expect(deriveOperationNature([true, null])).toBeNull();
    expect(deriveOperationNature([])).toBeNull();
  });
});
