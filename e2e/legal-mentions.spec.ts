import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";
import { apiGet, apiPost, apiPut } from "./api-helpers";
import { reloadWithFreshCache } from "./query-cache";

/**
 * Legal mentions per fiscal profile (src/lib/legal-mentions.ts): the settings
 * say what the company still lacks, a draft invoice says what it and its
 * client lack, and every new field round-trips through the API.
 */
const today = () => new Date().toISOString().slice(0, 10);

test.describe("Legal mentions", () => {
  test("Algeria: compliance is reported, then satisfied, from settings to invoice", async ({ page }) => {
    await signUp(page);
    await apiPut(page, "/api/settings", { fiscal_profile: "DZ" });

    // A business client with nothing but a name, and an invoice with no payment method.
    const client = await apiPost(page, "/api/clients", { name: "SARL Atlas" });
    expect(client.status).toBe(200);
    expect(client.body.is_consumer).toBe(false);
    const invoice = await apiPost(page, "/api/invoices", {
      client_id: client.body.id,
      issue_date: today(),
      lines: [{ description: "Travaux", quantity: 1, unit_price: 1000, tax_rate: 19 }],
    });
    expect(invoice.status).toBe(200);
    expect(invoice.body.payment_method).toBeNull();

    // The invoice page lists what the law requires and is missing.
    await page.goto(`/fr/invoices/${invoice.body.id}`);
    await reloadWithFreshCache(page);
    const banner = page.getByRole("status").filter({ hasText: "Cette facture n'est pas encore conforme" });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("le mode de paiement de la facture");
    await expect(banner).toContainText("le numéro RC du client");
    await expect(banner).toContainText("la forme juridique");

    // The settings card says the same about the company, then fill it in from the screen.
    await page.goto("/fr/settings");
    await reloadWithFreshCache(page);
    const card = page.getByRole("status").filter({ hasText: "Conformité des factures" });
    await expect(card).toContainText("le numéro du registre du commerce (RC)");
    await page.locator('select[name="legal_form"]').selectOption("SARL");
    await page.locator('input[name="share_capital"]').fill("100000");
    await page.locator('input[name="activity"]').fill("Commerce de gros");
    for (const [name, value] of [
      ["address", "12 rue Didouche Mourad"],
      ["siret", "16/00-0012345 B 20"],
      ["nis", "001616001234567"],
      ["vat_number", "000116001234567"],
    ]) {
      await page.locator(`input[name="${name}"]`).fill(value);
    }
    const saved = page.waitForResponse(
      (r) => r.url().includes("/api/settings") && r.request().method() === "PUT" && r.ok()
    );
    await page.getByRole("button", { name: /^(Save|Enregistrer)$/i }).first().click();
    await saved;
    await expect(card).toContainText("Toutes les informations exigées sur vos factures sont renseignées.");
    const settings = await apiGet(page, "/api/settings");
    expect(settings.body.legal_form).toBe("SARL");
    expect(Number(settings.body.share_capital)).toBe(100000);
    expect(settings.body.activity).toBe("Commerce de gros");

    // Complete the client and the invoice: the banner goes away.
    const updated = await apiPut(page, `/api/clients/${client.body.id}`, {
      name: "SARL Atlas",
      address: "Oran",
      siret: "31/00-0456789 B 12",
      nis: "003131000456789",
      legal_form: "SARL",
      activity: "BTP",
    });
    expect(updated.body.legal_form).toBe("SARL");
    const edited = await apiPut(page, `/api/invoices/${invoice.body.id}`, {
      client_id: client.body.id,
      issue_date: today(),
      due_date: today(),
      payment_method: "CHEQUE",
      lines: [{ description: "Travaux", quantity: 1, unit_price: 1000, tax_rate: 19 }],
    });
    expect(edited.body.payment_method).toBe("CHEQUE");
    await page.goto(`/fr/invoices/${invoice.body.id}`);
    await reloadWithFreshCache(page);
    await expect(page.getByText("Cette facture n'est pas encore conforme")).toHaveCount(0);
  });

  test("France: a consumer client is spared the B2B fields, and the franchise is saved", async ({ page }) => {
    await signUp(page);
    await apiPut(page, "/api/settings", { fiscal_profile: "FR" });

    await page.goto("/fr/settings");
    await reloadWithFreshCache(page);
    await page.locator('input[name="vat_franchise"]').check();
    await page.locator('select[name="legal_form"]').selectOption("EI");
    const saved = page.waitForResponse(
      (r) => r.url().includes("/api/settings") && r.request().method() === "PUT" && r.ok()
    );
    await page.getByRole("button", { name: /^(Save|Enregistrer)$/i }).first().click();
    await saved;
    const settings = await apiGet(page, "/api/settings");
    expect(settings.body.vat_franchise).toBe(true);
    expect(settings.body.legal_form).toBe("EI");

    // The client form hides company fields for a private individual.
    await page.goto("/fr/clients");
    await reloadWithFreshCache(page);
    await page.getByRole("button", { name: /Nouveau client/i }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator('select[name="legal_form"]')).toBeVisible();
    await dialog.locator('input[name="is_consumer"]').check();
    await expect(dialog.locator('select[name="legal_form"]')).toHaveCount(0);
    await dialog.locator('input[name="name"]').fill("Marie Martin");
    const created = page.waitForResponse(
      (r) => r.url().endsWith("/api/clients") && r.request().method() === "POST" && r.ok()
    );
    await dialog.getByRole("button", { name: /^(Créer|Create)$/i }).click();
    const body = await (await created).json();
    expect(body.is_consumer).toBe(true);
  });
});
