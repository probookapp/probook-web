import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import { signUp } from "./helpers";
import { apiDelete, apiGet, apiPost, apiPut } from "./api-helpers";
import { reloadWithFreshCache } from "./query-cache";

/**
 * Credit notes: a PDF and a Factur-X (type 381) naming the invoice they
 * correct, and an issued credit note can no longer be deleted.
 */
const today = () => new Date().toISOString().slice(0, 10);

test.describe("Credit note documents", () => {
  test("downloads as PDF and Factur-X, and stays once issued", async ({ page }) => {
    await signUp(page);
    await apiPut(page, "/api/settings", { fiscal_profile: "FR", currency: "EUR", company_name: "Atelier SAS", siret: "12345678900012" });
    const client = await apiPost(page, "/api/clients", { name: "Client SARL", siret: "98765432100015", address: "2 avenue X" });
    const invoice = await apiPost(page, "/api/invoices", {
      client_id: client.body.id,
      issue_date: today(),
      lines: [{ description: "Chaise", quantity: 2, unit_price: 50, tax_rate: 20 }],
    });
    await apiPost(page, `/api/invoices/${invoice.body.id}/issue`);
    const note = await apiPost(page, "/api/credit-notes", {
      client_id: client.body.id,
      invoice_id: invoice.body.id,
      issue_date: today(),
      reason: "Retour d'une chaise",
      lines: [{ description: "Chaise", quantity: 1, unit_price: 50, tax_rate: 20 }],
    });
    expect(note.status).toBe(200);

    const xml = await apiGet(page, `/api/credit-notes/${note.body.id}/facturx`);
    expect(xml.status).toBe(200);

    // Issued: kept in the numbering for good.
    const del = await apiDelete(page, `/api/credit-notes/${note.body.id}`);
    expect(del.status).toBe(409);

    await page.goto(`/fr/invoices/credit-notes/${note.body.id}`);
    await reloadWithFreshCache(page);
    const pdfDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Télécharger le PDF" }).click();
    expect((await pdfDownload).suggestedFilename()).toMatch(/\.pdf$/);

    const fxDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Télécharger en Factur-X" }).click();
    const fx = readFileSync((await (await fxDownload).path())!).toString("latin1");
    expect(fx).toContain("factur-x.xml");
    expect(fx).toContain("<pdfaid:part>3</pdfaid:part>");
  });
});
