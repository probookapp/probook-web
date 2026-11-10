/**
 * Factur-X / ZUGFeRD invoice data: UN/CEFACT Cross Industry Invoice (CII D16B)
 * at the EN 16931 profile, the structured half of a French electronic
 * invoice, embedded in the PDF/A-3 the customer reads (src/features/pdf/facturx-pdf.ts).
 *
 * Amounts are rebuilt with the same engine that totals the invoice
 * (src/lib/document-totals.ts) so the XML reconciles with what the PDF shows,
 * and the EN 16931 business rules hold by construction: lines' net amounts sum
 * to the line total, the document allowance and shipping charge are stated per
 * VAT rate, every rate has its breakdown, and the totals chain adds up.
 *
 * Element order follows the CII schema, which is sequence-strict.
 */
import { calculateLineTotals, resolveDocumentDiscount } from "@/lib/document-totals";
import { currencyMinorUnits, roundToUnits } from "@/lib/money";

export interface FacturxParty {
  name: string;
  siret?: string | null;
  vatNumber?: string | null;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  email?: string | null;
}

export interface FacturxLine {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  discountPercent?: number | null;
  unit?: string | null;
  isSubtotalLine?: boolean | null;
  isBundleHeader?: boolean | null;
}

export interface FacturxInput {
  number: string;
  /** 380 invoice, 381 credit note, 386 down payment invoice. */
  typeCode?: "380" | "381" | "386";
  issueDate: Date;
  dueDate?: Date | null;
  currency: string;
  seller: FacturxParty;
  buyer: FacturxParty;
  deliveryAddress?: string | null;
  lines: FacturxLine[];
  discountPercent?: number | null;
  discountAmount?: number | null;
  shippingCost?: number | null;
  shippingTaxRate?: number | null;
  /** Already received against this invoice. */
  paidAmount?: number | null;
  paymentMethod?: string | null;
  iban?: string | null;
  vatFranchise?: boolean;
  vatExemption?: string | null;
  vatExemptionNote?: string | null;
  vatOnDebits?: boolean;
  operationNature?: string | null;
  /** A credit note (381) names the invoice it corrects (BT-25/BT-26). */
  precedingInvoice?: { number: string; issueDate?: Date | null } | null;
  /** Payment terms as text (BT-20), e.g. how a credit note is settled. */
  paymentTerms?: string | null;
  /** Free-text notes, each with its UNTDID 4451 subject code (PMT, PMD, AAB, REG…). */
  notes?: Array<{ subject: string; content: string }>;
}

// UNTDID 5305 VAT categories.
type VatCategory = "S" | "Z" | "E" | "AE" | "K" | "G";

/** UN/ECE Recommendation 20 codes for the units products carry. */
const UNIT_CODES: Record<string, string> = {
  unit: "C62",
  piece: "H87",
  hour: "HUR",
  day: "DAY",
  month: "MON",
  year: "ANN",
  kg: "KGM",
  meter: "MTR",
  liter: "LTR",
  forfait: "LS",
};

/** UNTDID 4461 payment means. */
const PAYMENT_MEANS: Record<string, string> = {
  CASH: "10",
  CHEQUE: "20",
  TRANSFER: "58", // SEPA credit transfer
  CARD: "48",
};

const EXEMPTION_TEXT: Record<string, { category: VatCategory; code: string; reason: string }> = {
  INTRA_EU: { category: "K", code: "VATEX-EU-IC", reason: "Exonération de TVA, article 262 ter I du CGI" },
  EXPORT: { category: "G", code: "VATEX-EU-G", reason: "Exonération de TVA, article 262 I du CGI" },
  REVERSE_CHARGE: { category: "AE", code: "VATEX-EU-AE", reason: "Autoliquidation" },
};
const FRANCHISE = { category: "E" as VatCategory, code: "VATEX-FR-FRANCHISE", reason: "TVA non applicable, article 293 B du CGI" };

function xml(text: string | number | null | undefined): string {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const ymd = (d: Date) =>
  `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;

/** "FR", from a country field that may hold "FR", "France" or nothing. */
export function countryCode(country: string | null | undefined, fallback: string): string {
  const c = (country ?? "").trim();
  if (/^[A-Za-z]{2}$/.test(c)) return c.toUpperCase();
  const known: Record<string, string> = { france: "FR", algerie: "DZ", "algérie": "DZ", algeria: "DZ", belgique: "BE", maroc: "MA", tunisie: "TN" };
  return known[c.toLowerCase()] ?? fallback;
}

/** The 9-digit SIREN at the head of a SIRET (or a SIREN as is). */
export function sirenOf(siret: string | null | undefined): string | null {
  const digits = (siret ?? "").replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(0, 9) : null;
}

function party(tag: string, p: FacturxParty, fallbackCountry: string): string {
  const siren = sirenOf(p.siret);
  const parts = [`<ram:${tag}>`, `<ram:Name>${xml(p.name)}</ram:Name>`];
  if (siren) {
    // ISO 6523 0002: the SIREN.
    parts.push(`<ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">${siren}</ram:ID></ram:SpecifiedLegalOrganization>`);
  }
  parts.push("<ram:PostalTradeAddress>");
  if (p.postalCode) parts.push(`<ram:PostcodeCode>${xml(p.postalCode)}</ram:PostcodeCode>`);
  if (p.address) parts.push(`<ram:LineOne>${xml(p.address)}</ram:LineOne>`);
  if (p.city) parts.push(`<ram:CityName>${xml(p.city)}</ram:CityName>`);
  parts.push(`<ram:CountryID>${countryCode(p.country, fallbackCountry)}</ram:CountryID>`, "</ram:PostalTradeAddress>");
  if (p.email) parts.push(`<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${xml(p.email)}</ram:URIID></ram:URIUniversalCommunication>`);
  if (p.vatNumber && p.vatNumber.trim()) {
    parts.push(`<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${xml(p.vatNumber.replace(/\s/g, ""))}</ram:ID></ram:SpecifiedTaxRegistration>`);
  }
  parts.push(`</ram:${tag}>`);
  return parts.join("");
}

interface TaxGroup {
  category: VatCategory;
  rate: number;
  basis: number;
  tax: number;
}

export function buildFacturxXml(input: FacturxInput): string {
  const units = currencyMinorUnits(input.currency);
  // Factur-X amounts carry two decimals (BR-DEC-*), whatever the currency.
  const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const round = (n: number) => r2(roundToUnits(n, units));
  const amt = (n: number) => r2(n).toFixed(2);

  const exemption = input.vatFranchise ? FRANCHISE : input.vatExemption ? EXEMPTION_TEXT[input.vatExemption] : undefined;
  const categoryFor = (rate: number): VatCategory => (rate > 0 ? "S" : (exemption?.category ?? "E"));

  const billed = input.lines.filter((l) => !l.isSubtotalLine && !l.isBundleHeader);
  const priced = billed.map((l) => ({
    line: l,
    totals: calculateLineTotals(
      { quantity: l.quantity, unit_price: l.unitPrice, tax_rate: l.taxRate, discount_percent: l.discountPercent },
      input.currency
    ),
  }));
  const lineTotal = round(priced.reduce((s, p) => s + p.totals.subtotal, 0));
  const { keptRatio } = resolveDocumentDiscount(lineTotal, input.discountPercent, input.discountAmount, input.currency);

  // Per VAT rate: the lines' base, the share of the document discount, tax.
  const groups = new Map<string, TaxGroup & { lines: number; discounted: number }>();
  for (const { line, totals } of priced) {
    const cat = categoryFor(line.taxRate);
    const key = `${cat}:${line.taxRate}`;
    const g = groups.get(key) ?? { category: cat, rate: line.taxRate, basis: 0, tax: 0, lines: 0, discounted: 0 };
    g.lines = round(g.lines + totals.subtotal);
    const kept = round(totals.subtotal * keptRatio);
    g.discounted = round(g.discounted + kept);
    g.tax = round(g.tax + round(kept * (line.taxRate / 100)));
    groups.set(key, g);
  }
  const allowances = [...groups.values()]
    .map((g) => ({ category: g.category, rate: g.rate, amount: round(g.lines - g.discounted) }))
    .filter((a) => a.amount > 0);

  const shipping = Math.max(0, input.shippingCost ?? 0);
  const shippingRate = input.shippingTaxRate ?? 0;
  const shippingTax = round(shipping * (shippingRate / 100));
  if (shipping > 0) {
    const cat = categoryFor(shippingRate);
    const key = `${cat}:${shippingRate}`;
    const g = groups.get(key) ?? { category: cat, rate: shippingRate, basis: 0, tax: 0, lines: 0, discounted: 0 };
    g.discounted = round(g.discounted + shipping);
    g.tax = round(g.tax + shippingTax);
    groups.set(key, g);
  }
  for (const g of groups.values()) g.basis = g.discounted;

  // EN 16931 recomputes each rate's tax from its basis (BR-CO-17); use that
  // figure so the breakdown always validates. It differs from the line-by-line
  // sum by a cent at most, and only on documents with many lines at one rate.
  const breakdown = [...groups.values()].map((g) => ({ ...g, tax: r2((g.basis * g.rate) / 100) }));
  const taxTotal = r2(breakdown.reduce((s, g) => s + g.tax, 0));
  const allowanceTotal = r2(allowances.reduce((s, a) => s + a.amount, 0));
  const chargeTotal = r2(shipping);
  const basisTotal = r2(lineTotal - allowanceTotal + chargeTotal);
  const grandTotal = r2(basisTotal + taxTotal);
  const paid = r2(Math.min(Math.max(0, input.paidAmount ?? 0), grandTotal));
  const due = r2(grandTotal - paid);

  const sellerCountry = countryCode(input.seller.country, "FR");
  const out: string[] = [];
  out.push(
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">',
    "<rsm:ExchangedDocumentContext>",
    "<ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>urn:cen.eu:en16931:2017</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter>",
    "</rsm:ExchangedDocumentContext>",
    "<rsm:ExchangedDocument>",
    `<ram:ID>${xml(input.number)}</ram:ID>`,
    `<ram:TypeCode>${input.typeCode ?? "380"}</ram:TypeCode>`,
    `<ram:IssueDateTime><udt:DateTimeString format="102">${ymd(input.issueDate)}</udt:DateTimeString></ram:IssueDateTime>`
  );
  for (const note of input.notes ?? []) {
    out.push(`<ram:IncludedNote><ram:Content>${xml(note.content)}</ram:Content><ram:SubjectCode>${xml(note.subject)}</ram:SubjectCode></ram:IncludedNote>`);
  }
  out.push("</rsm:ExchangedDocument>", "<rsm:SupplyChainTradeTransaction>");

  priced.forEach(({ line, totals }, i) => {
    const net = line.quantity !== 0 ? totals.subtotal / line.quantity : 0;
    const unit = UNIT_CODES[line.unit ?? "unit"] ?? "C62";
    out.push(
      "<ram:IncludedSupplyChainTradeLineItem>",
      `<ram:AssociatedDocumentLineDocument><ram:LineID>${i + 1}</ram:LineID></ram:AssociatedDocumentLineDocument>`,
      `<ram:SpecifiedTradeProduct><ram:Name>${xml(line.description)}</ram:Name></ram:SpecifiedTradeProduct>`,
      // Net of the line discount, to four decimals (BT-146 has no 2-decimal rule).
      `<ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>${(Math.round(net * 10000) / 10000).toFixed(4)}</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>`,
      `<ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="${unit}">${line.quantity}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>`,
      "<ram:SpecifiedLineTradeSettlement>",
      `<ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>${categoryFor(line.taxRate)}</ram:CategoryCode><ram:RateApplicablePercent>${line.taxRate}</ram:RateApplicablePercent></ram:ApplicableTradeTax>`,
      `<ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${amt(totals.subtotal)}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>`,
      "</ram:SpecifiedLineTradeSettlement>",
      "</ram:IncludedSupplyChainTradeLineItem>"
    );
  });

  out.push(
    "<ram:ApplicableHeaderTradeAgreement>",
    party("SellerTradeParty", input.seller, sellerCountry),
    party("BuyerTradeParty", input.buyer, sellerCountry),
    "</ram:ApplicableHeaderTradeAgreement>",
    "<ram:ApplicableHeaderTradeDelivery>"
  );
  if (input.deliveryAddress && input.deliveryAddress.trim()) {
    out.push(
      `<ram:ShipToTradeParty><ram:Name>${xml(input.buyer.name)}</ram:Name><ram:PostalTradeAddress><ram:LineOne>${xml(input.deliveryAddress.trim())}</ram:LineOne><ram:CountryID>${countryCode(input.buyer.country, sellerCountry)}</ram:CountryID></ram:PostalTradeAddress></ram:ShipToTradeParty>`
    );
  }
  out.push("</ram:ApplicableHeaderTradeDelivery>", "<ram:ApplicableHeaderTradeSettlement>");
  out.push(`<ram:InvoiceCurrencyCode>${xml(input.currency)}</ram:InvoiceCurrencyCode>`);

  const means = input.paymentMethod ? PAYMENT_MEANS[input.paymentMethod] : undefined;
  if (means || input.iban) {
    out.push(`<ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>${means ?? "58"}</ram:TypeCode>`);
    if (input.iban && (means ?? "58") === "58") {
      out.push(`<ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${xml(input.iban.replace(/\s/g, ""))}</ram:IBANID></ram:PayeePartyCreditorFinancialAccount>`);
    }
    out.push("</ram:SpecifiedTradeSettlementPaymentMeans>");
  }

  for (const g of breakdown) {
    out.push("<ram:ApplicableTradeTax>", `<ram:CalculatedAmount>${amt(g.tax)}</ram:CalculatedAmount>`, "<ram:TypeCode>VAT</ram:TypeCode>");
    const exempt = g.category !== "S" && g.category !== "Z";
    if (exempt) {
      const reason = g.category === "E" && !input.vatFranchise ? input.vatExemptionNote || "Exonération de TVA" : exemption?.reason;
      if (reason) out.push(`<ram:ExemptionReason>${xml(reason)}</ram:ExemptionReason>`);
    }
    out.push(`<ram:BasisAmount>${amt(g.basis)}</ram:BasisAmount>`, `<ram:CategoryCode>${g.category}</ram:CategoryCode>`);
    if (exempt && exemption?.code && (input.vatFranchise || g.category !== "E")) {
      out.push(`<ram:ExemptionReasonCode>${exemption.code}</ram:ExemptionReasonCode>`);
    }
    // UNTDID 2475 code 72: VAT due on payment, the French default for
    // services; under the débits option it is due on invoicing (5).
    if (g.category === "S" && input.operationNature && input.operationNature !== "GOODS") {
      out.push(`<ram:DueDateTypeCode>${input.vatOnDebits ? "5" : "72"}</ram:DueDateTypeCode>`);
    }
    out.push(`<ram:RateApplicablePercent>${g.rate}</ram:RateApplicablePercent>`, "</ram:ApplicableTradeTax>");
  }

  for (const a of allowances) {
    out.push(
      "<ram:SpecifiedTradeAllowanceCharge>",
      "<ram:ChargeIndicator><udt:Indicator>false</udt:Indicator></ram:ChargeIndicator>",
      `<ram:ActualAmount>${amt(a.amount)}</ram:ActualAmount>`,
      "<ram:Reason>Remise</ram:Reason>",
      `<ram:CategoryTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>${a.category}</ram:CategoryCode><ram:RateApplicablePercent>${a.rate}</ram:RateApplicablePercent></ram:CategoryTradeTax>`,
      "</ram:SpecifiedTradeAllowanceCharge>"
    );
  }
  if (shipping > 0) {
    out.push(
      "<ram:SpecifiedTradeAllowanceCharge>",
      "<ram:ChargeIndicator><udt:Indicator>true</udt:Indicator></ram:ChargeIndicator>",
      `<ram:ActualAmount>${amt(shipping)}</ram:ActualAmount>`,
      "<ram:Reason>Frais de port</ram:Reason>",
      `<ram:CategoryTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>${categoryFor(shippingRate)}</ram:CategoryCode><ram:RateApplicablePercent>${shippingRate}</ram:RateApplicablePercent></ram:CategoryTradeTax>`,
      "</ram:SpecifiedTradeAllowanceCharge>"
    );
  }

  // A due date, or terms, is required whenever something remains to be paid (BR-CO-25).
  if (input.dueDate || input.paymentTerms) {
    out.push("<ram:SpecifiedTradePaymentTerms>");
    if (input.paymentTerms) out.push(`<ram:Description>${xml(input.paymentTerms)}</ram:Description>`);
    if (input.dueDate) {
      out.push(`<ram:DueDateDateTime><udt:DateTimeString format="102">${ymd(input.dueDate)}</udt:DateTimeString></ram:DueDateDateTime>`);
    }
    out.push("</ram:SpecifiedTradePaymentTerms>");
  }
  out.push(
    "<ram:SpecifiedTradeSettlementHeaderMonetarySummation>",
    `<ram:LineTotalAmount>${amt(lineTotal)}</ram:LineTotalAmount>`,
    `<ram:ChargeTotalAmount>${amt(chargeTotal)}</ram:ChargeTotalAmount>`,
    `<ram:AllowanceTotalAmount>${amt(allowanceTotal)}</ram:AllowanceTotalAmount>`,
    `<ram:TaxBasisTotalAmount>${amt(basisTotal)}</ram:TaxBasisTotalAmount>`,
    `<ram:TaxTotalAmount currencyID="${xml(input.currency)}">${amt(taxTotal)}</ram:TaxTotalAmount>`,
    `<ram:GrandTotalAmount>${amt(grandTotal)}</ram:GrandTotalAmount>`,
    `<ram:TotalPrepaidAmount>${amt(paid)}</ram:TotalPrepaidAmount>`,
    `<ram:DuePayableAmount>${amt(due)}</ram:DuePayableAmount>`,
    "</ram:SpecifiedTradeSettlementHeaderMonetarySummation>",
    ...(input.precedingInvoice
      ? [
          "<ram:InvoiceReferencedDocument>",
          `<ram:IssuerAssignedID>${xml(input.precedingInvoice.number)}</ram:IssuerAssignedID>`,
          ...(input.precedingInvoice.issueDate
            ? [`<ram:FormattedIssueDateTime><qdt:DateTimeString format="102">${ymd(input.precedingInvoice.issueDate)}</qdt:DateTimeString></ram:FormattedIssueDateTime>`]
            : []),
          "</ram:InvoiceReferencedDocument>",
        ]
      : []),
    "</ram:ApplicableHeaderTradeSettlement>",
    "</rsm:SupplyChainTradeTransaction>",
    "</rsm:CrossIndustryInvoice>"
  );
  return out.join("\n");
}
