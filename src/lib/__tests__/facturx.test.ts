import { describe, expect, it } from "vitest";
import { buildFacturxXml, countryCode, sirenOf } from "../facturx";
import { calculateDocumentTotals } from "../document-totals";

const seller = { name: "Atelier & Fils", siret: "123 456 789 00012", vatNumber: "FR32 123456789", address: "1 rue X", postalCode: "75002", city: "Paris", country: "France" };
const buyer = { name: "Client <SARL>", siret: "98765432100015", address: "2 av. Y", postalCode: "69001", city: "Lyon", country: "FR" };
const base = { number: "FAC-1", issueDate: new Date("2026-11-03"), dueDate: new Date("2026-12-03"), currency: "EUR", seller, buyer };

/** The text of every element with this tag, in order. */
const all = (xml: string, tag: string) => [...xml.matchAll(new RegExp(`<ram:${tag}[^>]*>([^<]*)</ram:${tag}>`, "g"))].map((m) => m[1]);
const one = (xml: string, tag: string) => all(xml, tag)[0];

describe("Factur-X CII (EN 16931)", () => {
  it("declares the EN 16931 profile, the number, the type and the dates", () => {
    const xml = buildFacturxXml({ ...base, lines: [{ description: "Conseil", quantity: 1, unitPrice: 100, taxRate: 20 }] });
    expect(xml).toContain("<ram:ID>urn:cen.eu:en16931:2017</ram:ID>");
    expect(one(xml, "TypeCode")).toBe("380");
    expect(xml).toContain('<udt:DateTimeString format="102">20261103</udt:DateTimeString>');
    expect(xml).toContain('<udt:DateTimeString format="102">20261203</udt:DateTimeString>');
  });

  it("reconciles with the invoice's own totals engine: discounts, two rates, shipping", () => {
    const lines = [
      { description: "Chaise", quantity: 2, unitPrice: 49.99, taxRate: 20, discountPercent: 10 },
      { description: "Livre", quantity: 1, unitPrice: 12.5, taxRate: 5.5 },
    ];
    const xml = buildFacturxXml({ ...base, lines, discountPercent: 5, shippingCost: 9.9, shippingTaxRate: 20, paidAmount: 20 });
    const engine = calculateDocumentTotals({
      lines: lines.map((l) => ({ quantity: l.quantity, unit_price: l.unitPrice, tax_rate: l.taxRate, discount_percent: l.discountPercent })),
      discountPercent: 5,
      shippingCost: 9.9,
      shippingTaxRate: 20,
      currency: "EUR",
    });
    expect(one(xml, "TaxBasisTotalAmount")).toBe(engine.subtotal.toFixed(2));
    expect(one(xml, "GrandTotalAmount")).toBe(engine.total.toFixed(2));
    expect(one(xml, "DuePayableAmount")).toBe((engine.total - 20).toFixed(2));
    // BR-CO-10/13: the totals chain adds up.
    // The last LineTotalAmount is the header summation; the others are per line.
    const lineTotal = Number(all(xml, "LineTotalAmount").at(-1));
    expect(lineTotal).toBeCloseTo(102.48, 2);
    expect(Number(one(xml, "AllowanceTotalAmount")) + Number(one(xml, "TaxBasisTotalAmount"))).toBeCloseTo(
      lineTotal + Number(one(xml, "ChargeTotalAmount")),
      2
    );
    // BR-CO-17: each rate's tax is its basis times its rate.
    const bases = all(xml, "BasisAmount").map(Number);
    const taxes = all(xml, "CalculatedAmount").map(Number);
    const rates = [20, 5.5];
    bases.forEach((b, i) => expect(taxes[i]).toBeCloseTo(Math.round(b * rates[i]) / 100, 2));
  });

  it("states the franchise as category E with its reason and code", () => {
    const xml = buildFacturxXml({ ...base, vatFranchise: true, lines: [{ description: "Cours", quantity: 1, unitPrice: 80, taxRate: 0 }] });
    expect(all(xml, "CategoryCode")).toEqual(["E", "E"]);
    expect(one(xml, "ExemptionReason")).toBe("TVA non applicable, art. 293 B du CGI");
    expect(one(xml, "ExemptionReasonCode")).toBe("VATEX-FR-FRANCHISE");
  });

  it("maps an intra-EU supply to category K", () => {
    const xml = buildFacturxXml({ ...base, vatExemption: "INTRA_EU", lines: [{ description: "Machine", quantity: 1, unitPrice: 1000, taxRate: 0 }] });
    expect(all(xml, "CategoryCode")).toEqual(["K", "K"]);
    expect(one(xml, "ExemptionReasonCode")).toBe("VATEX-EU-IC");
  });

  it("skips title rows and pack headers, numbers the billed lines", () => {
    const xml = buildFacturxXml({
      ...base,
      lines: [
        { description: "Titre", quantity: 0, unitPrice: 0, taxRate: 0, isSubtotalLine: true },
        { description: "Pack", quantity: 1, unitPrice: 30, taxRate: 20, isBundleHeader: true },
        { description: "A", quantity: 1, unitPrice: 10, taxRate: 20, unit: "hour" },
        { description: "B", quantity: 2, unitPrice: 10, taxRate: 20, unit: "kg" },
      ],
    });
    expect(all(xml, "LineID")).toEqual(["1", "2"]);
    expect(xml).toContain('unitCode="HUR"');
    expect(xml).toContain('unitCode="KGM"');
  });

  it("escapes text and identifies parties by SIREN and VAT number", () => {
    const xml = buildFacturxXml({ ...base, lines: [{ description: "Vis & écrous <M6>", quantity: 1, unitPrice: 1, taxRate: 20 }] });
    expect(xml).toContain("Vis &amp; écrous &lt;M6&gt;");
    expect(xml).toContain("Client &lt;SARL&gt;");
    expect(xml).toContain('<ram:ID schemeID="0002">123456789</ram:ID>');
    expect(xml).toContain('<ram:ID schemeID="VA">FR32123456789</ram:ID>');
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
  });

  it("writes the IBAN for a transfer and the VAT due date for services", () => {
    const xml = buildFacturxXml({
      ...base,
      paymentMethod: "TRANSFER",
      iban: "FR76 3000 6000 0112 3456 7890 189",
      operationNature: "SERVICES",
      vatOnDebits: true,
      lines: [{ description: "Conseil", quantity: 1, unitPrice: 100, taxRate: 20 }],
    });
    expect(xml).toContain("<ram:TypeCode>58</ram:TypeCode>");
    expect(one(xml, "IBANID")).toBe("FR7630006000011234567890189");
    expect(one(xml, "DueDateTypeCode")).toBe("5");
  });

  it("reads SIRENs and country codes", () => {
    expect(sirenOf("123 456 789 00012")).toBe("123456789");
    expect(sirenOf("12345")).toBeNull();
    expect(countryCode("France", "DZ")).toBe("FR");
    expect(countryCode("de", "FR")).toBe("DE");
    expect(countryCode("", "FR")).toBe("FR");
  });
});
