import { describe, it, expect } from "vitest";
import { toSnakeCase } from "../api-utils";
import { paymentOverdueEmail } from "../email";

/**
 * Two long-standing hardening items from the July audit (CFG-N1, CFG-N2),
 * both of which mangle or misrender data that a customer sees.
 */
describe("toSnakeCase only rewrites camelCase field names", () => {
  it("converts Prisma-style fields", () => {
    expect(toSnakeCase({ invoiceNumber: "F-1", taxAmount: 19 })).toEqual({
      invoice_number: "F-1",
      tax_amount: 19,
    });
  });

  it("leaves an upper-case map key alone", () => {
    // A payment-method breakdown keyed by CASH/CARD used to come back as
    // "_c_a_s_h", i.e. unusable by the caller that built it.
    expect(toSnakeCase({ salesByMethod: { CASH: 100, CARD: 50 } })).toEqual({
      sales_by_method: { CASH: 100, CARD: 50 },
    });
  });

  it("leaves a capitalised JSON-column key alone", () => {
    // Variant attributes are free-form JSON: "Color" is the user's key, not a
    // schema field, and must survive the trip out.
    expect(toSnakeCase({ attributes: { Color: "Argent", "size-eu": "42" } })).toEqual({
      attributes: { Color: "Argent", "size-eu": "42" },
    });
  });

  it("still recurses through arrays and nested rows", () => {
    expect(toSnakeCase({ lines: [{ unitPrice: 10, taxRate: 19 }] })).toEqual({
      lines: [{ unit_price: 10, tax_rate: 19 }],
    });
  });
});

describe("HTML emails escape what users typed", () => {
  const mail = (clientName: string, companyName = "Probook") =>
    paymentOverdueEmail({
      companyName,
      clientName,
      invoiceNumber: "FAC-2026-001",
      total: 1000,
      currency: "DZD",
      dueDate: "2026-07-01",
    });

  it("neutralises markup in a client name", () => {
    const { html } = mail('<img src=x onerror="alert(1)">');
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("renders an ampersand as an entity rather than breaking the markup", () => {
    // Far more common than an attack: "Belkacem & Fils".
    const { html } = mail("Belkacem & Fils");
    expect(html).toContain("Belkacem &amp; Fils");
  });

  it("escapes the sender's own name too", () => {
    const { html } = mail("Client", "Café <b>Central</b>");
    expect(html).not.toContain("<b>Central</b>");
    // Accents are fine as they are — the email is UTF-8. Only markup is neutralised.
    expect(html).toContain("Café &lt;b&gt;Central&lt;/b&gt;");
  });
});
