import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import { signUp } from "./helpers";
import { apiGet, apiPost, apiPut } from "./api-helpers";
import { reloadWithFreshCache } from "./query-cache";

/**
 * Factur-X (src/lib/facturx.ts, src/features/pdf/facturx-pdf.ts): an issued
 * French invoice downloads as a PDF/A-3 carrying its EN 16931 XML, and the
 * e-invoicing mentions are stored and derived.
 */
const today = () => new Date().toISOString().slice(0, 10);

test.describe("Factur-X", () => {
  test("an issued French invoice downloads as Factur-X with its XML", async ({ page }) => {
    await signUp(page);
    await apiPut(page, "/api/settings", {
      fiscal_profile: "FR",
      currency: "EUR",
      company_name: "Atelier SAS",
      siret: "12345678900012",
      vat_number: "FR32123456789",
      address: "1 rue de la Paix",
      postal_code: "75002",
      city: "Paris",
      legal_form: "SAS",
      share_capital: 5000,
    });
    const client = await apiPost(page, "/api/clients", {
      name: "Client SARL",
      siret: "98765432100015",
      address: "2 avenue X",
      postal_code: "69001",
      city: "Lyon",
    });
    const product = await apiPost(page, "/api/products", { designation: "Conseil", unit_price: 100, tax_rate: 20, is_service: true });
    expect(product.status).toBe(200);
    const invoice = await apiPost(page, "/api/invoices", {
      client_id: client.body.id,
      issue_date: today(),
      payment_method: "TRANSFER",
      delivery_address: "Entrepôt, 5 rue Y, Lyon",
      lines: [{ product_id: product.body.id, description: "Conseil", quantity: 2, unit_price: 100, tax_rate: 20 }],
    });
    expect(invoice.status).toBe(200);
    // Every line has a product, all services: the nature is derived.
    expect(invoice.body.operation_nature).toBe("SERVICES");
    expect(invoice.body.delivery_address).toBe("Entrepôt, 5 rue Y, Lyon");

    // A draft has no Factur-X.
    expect((await apiGet(page, `/api/invoices/${invoice.body.id}/facturx`)).status).toBe(400);
    await apiPost(page, `/api/invoices/${invoice.body.id}/issue`);

    await page.goto(`/fr/invoices/${invoice.body.id}`);
    await reloadWithFreshCache(page);
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "Télécharger en Factur-X" }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(/factur-x\.pdf$/);
    const pdf = readFileSync((await download.path())!).toString("latin1");
    expect(pdf.startsWith("%PDF-")).toBe(true);
    expect(pdf).toContain("factur-x.xml");
    expect(pdf).toContain("/AFRelationship /Alternative");
    expect(pdf).toContain("<pdfaid:part>3</pdfaid:part>");
    expect(pdf).toContain("GTS_PDFA1");
  });
});
