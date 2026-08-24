import { test, expect, type Page } from "@playwright/test";
import { signUp, navigateTo } from "./helpers";
import { apiGet, apiPost, apiPut } from "./api-helpers";
import { reloadWithFreshCache } from "./query-cache";

/** Save the tenant's fiscal regime, keeping the other required settings valid. */
async function setProfile(page: Page, fiscal_profile: string, default_tax_rate: number) {
  return apiPut(page, "/api/settings", {
    company_name: "Électro Souk",
    default_tax_rate,
    default_payment_terms: 30,
    invoice_prefix: "FA-",
    quote_prefix: "DV-",
    fiscal_profile,
  });
}

/**
 * Switch the fiscal regime the way a user does — through the settings form.
 * Saving invalidates the cached company-settings query, so every screen picks
 * the new regime up immediately.
 */
async function switchProfileViaUi(page: Page, profile: string) {
  await navigateTo(page, "settings");
  await page.locator('select[name="fiscal_profile"]').selectOption(profile);

  // Wait for the save itself, not for the form to look saved. The button
  // re-disables as soon as the form stops being dirty, which happens before
  // the PUT resolves — so the next screen could still be reading the previous
  // regime from the cache.
  const saved = page.waitForResponse(
    (r) => r.url().includes("/api/settings") && r.request().method() === "PUT" && r.ok()
  );
  await page.getByRole("button", { name: /^(Save|Enregistrer)$/i }).first().click();
  await saved;

  await expect(page.locator('select[name="fiscal_profile"]')).toHaveValue(profile);
  await expect(
    page.getByRole("button", { name: /^(Save|Enregistrer)$/i }).first()
  ).toBeDisabled();
}

/** POST a CSV to a client import endpoint from the browser context. */
async function importClientsCsv(page: Page, csv: string) {
  return page.evaluate(async (csvText) => {
    const file = new File([csvText], "clients.csv", { type: "text/csv" });
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/import/clients", {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    return { status: r.status, body: await r.json() };
  }, csv);
}

/**
 * Country fiscal regime.
 *
 * Probook targets Algeria, so a new tenant starts on the Algerian regime with
 * dinars and the 0/9/19 VAT scale. France must stay fully usable: switching the
 * profile relabels the identifiers and swaps the VAT scale without touching a
 * single stored value.
 */
test.describe("Fiscal profile", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("a new tenant starts on the Algerian regime", async ({ page }) => {
    const res = await apiGet(page, "/api/settings");
    expect(res.status).toBe(200);
    expect(res.body.fiscal_profile).toBe("DZ");
    expect(res.body.currency).toBe("DZD");
    expect(res.body.default_tax_rate).toBe(19);
  });

  test("company identifiers round-trip, including the Algerian-only ones", async ({ page }) => {
    const saved = await apiPut(page, "/api/settings", {
      company_name: "Électro Souk",
      default_tax_rate: 19,
      default_payment_terms: 30,
      invoice_prefix: "FA-",
      quote_prefix: "DV-",
      siret: "16/00-1234567 B 08",
      vat_number: "000116001234567",
      nis: "0016123456789",
      art: "52101",
    });
    expect(saved.status).toBe(200);

    const res = await apiGet(page, "/api/settings");
    expect(res.body.siret).toBe("16/00-1234567 B 08");
    expect(res.body.vat_number).toBe("000116001234567");
    expect(res.body.nis).toBe("0016123456789");
    expect(res.body.art).toBe("52101");
  });

  test("switching to France keeps the stored identifiers intact", async ({ page }) => {
    await apiPut(page, "/api/settings", {
      company_name: "Électro Souk",
      default_tax_rate: 19,
      default_payment_terms: 30,
      invoice_prefix: "FA-",
      quote_prefix: "DV-",
      siret: "16/00-1234567 B 08",
      vat_number: "000116001234567",
      nis: "0016123456789",
      art: "52101",
    });

    const switched = await setProfile(page, "FR", 20);
    expect(switched.status).toBe(200);

    const res = await apiGet(page, "/api/settings");
    expect(res.body.fiscal_profile).toBe("FR");
    // Nothing was rewritten — the values are simply labelled SIRET / N° TVA now.
    expect(res.body.siret).toBe("16/00-1234567 B 08");
    expect(res.body.vat_number).toBe("000116001234567");
    expect(res.body.nis).toBe("0016123456789");
  });

  test("an unknown profile is rejected rather than silently stored", async ({ page }) => {
    const res = await setProfile(page, "BE", 19);
    expect(res.status).toBe(400);
  });

  test("clients carry the Algerian identifiers", async ({ page }) => {
    const created = await apiPost(page, "/api/clients", {
      name: "SARL Atlas Distribution",
      vat_number: "099916001234567",
      siret: "16/00-0987654 B 11",
      nis: "0016098765432",
      art: "52204",
    });
    expect(created.status).toBe(200);
    expect(created.body.nis).toBe("0016098765432");
    expect(created.body.art).toBe("52204");

    const updated = await apiPut(page, `/api/clients/${created.body.id}`, {
      name: "SARL Atlas Distribution",
      vat_number: "099916001234567",
      siret: "16/00-0987654 B 11",
      nis: "0016000000000",
      art: "52205",
    });
    expect(updated.status).toBe(200);
    expect(updated.body.nis).toBe("0016000000000");
    expect(updated.body.art).toBe("52205");
  });

  test("client import accepts the Algerian column names", async ({ page }) => {
    const res = await importClientsCsv(
      page,
      [
        "name,nif,rc,nis,art",
        "EURL Numidia Store,099931000456789,31/00-0456789 B 12,0031045678901,52301",
      ].join("\n")
    );
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(1);

    const list = await apiGet(page, "/api/clients");
    const rows = list.body as unknown as Record<string, string>[];
    const imported = rows.find((c) => c.name === "EURL Numidia Store");
    expect(imported?.vat_number).toBe("099931000456789");
    expect(imported?.siret).toBe("31/00-0456789 B 12");
    expect(imported?.nis).toBe("0031045678901");
  });

  // ─── UI ───

  test("the client form shows the Algerian identifiers, then the French ones", async ({ page }) => {
    await navigateTo(page, "clients");
    await page.getByRole("button", { name: /New client|Nouveau client/i }).first().click();

    const dialog = page.locator('[role="dialog"]').last();
    await expect(dialog.locator('input[name="vat_number"]')).toBeVisible();
    await expect(dialog.locator('input[name="siret"]')).toBeVisible();
    await expect(dialog.locator('input[name="nis"]')).toBeVisible();
    await expect(dialog.locator('input[name="art"]')).toBeVisible();

    // Switch the tenant to the French regime and reopen the form.
    await switchProfileViaUi(page, "FR");
    await navigateTo(page, "clients");
    await page.getByRole("button", { name: /New client|Nouveau client/i }).first().click();

    const frDialog = page.locator('[role="dialog"]').last();
    await expect(frDialog.locator('input[name="siret"]')).toBeVisible();
    await expect(frDialog.locator('input[name="vat_number"]')).toBeVisible();
    // NIS and the tax article are Algeria-only.
    await expect(frDialog.locator('input[name="nis"]')).toHaveCount(0);
    await expect(frDialog.locator('input[name="art"]')).toHaveCount(0);
  });

  test("the product form offers the regime's VAT scale", async ({ page }) => {
    await navigateTo(page, "products");
    await page.getByRole("button", { name: /New product|Nouveau produit/i }).first().click();

    const select = page.locator('[role="dialog"]').last().locator('select[name="tax_rate"]');
    await expect(select.locator("option")).toHaveText(["0%", "9%", "19%"]);

    await switchProfileViaUi(page, "FR");
    await navigateTo(page, "products");
    await page.getByRole("button", { name: /New product|Nouveau produit/i }).first().click();

    const frSelect = page.locator('[role="dialog"]').last().locator('select[name="tax_rate"]');
    await expect(frSelect.locator("option")).toHaveText(["0%", "2.1%", "5.5%", "10%", "20%"]);
  });

  test("a product keeps a rate the current regime does not offer", async ({ page }) => {
    // Created under the Algerian regime at 19%, then the tenant moves to France.
    const product = await apiPost(page, "/api/products", {
      designation: "Téléviseur LED",
      unit_price: 42000,
      tax_rate: 19,
      unit: "unit",
      is_service: false,
    });
    expect(product.status).toBe(200);

    await switchProfileViaUi(page, "FR");

    await navigateTo(page, "products");
    await page.getByRole("button", { name: /Edit|Modifier/i }).first().click();

    const select = page.locator('[role="dialog"]').last().locator('select[name="tax_rate"]');
    // 19% is grafted onto the French scale rather than silently reset to 20%.
    await expect(select.locator("option")).toHaveText([
      "0%",
      "2.1%",
      "5.5%",
      "10%",
      "19%",
      "20%",
    ]);
    await expect(select).toHaveValue("19");
  });
});

/**
 * A regime change has to take the paperwork with it.
 *
 * The stamp duty switch is hidden outside Algeria, so nobody can turn it on
 * there — but a business that enabled it under the Algerian regime and later
 * moved keeps the stored flag. Everything downstream must read both halves, or
 * that business goes on being asked Algerian questions on every invoice while
 * the server, correctly, charges nothing.
 */
test.describe("Algerian rules stay in Algeria", () => {
  test("a tenant that leaves the regime stops being asked its questions", async ({ page }) => {
    await signUp(page);
    const enabled = await apiPut(page, "/api/settings", { stamp_duty_enabled: true });
    expect(enabled.status, JSON.stringify(enabled.body).slice(0, 200)).toBe(200);
    const probe = await apiGet(page, "/api/settings");
    expect(probe.body.stamp_duty_enabled, JSON.stringify(probe.body).slice(0, 200)).toBe(true);
    expect(probe.body.fiscal_profile).toBe("DZ");
    await page.goto("/fr/invoices/new");
    // Sign-up cached the settings as they were; without this the page reads the
    // previous world and the boxes correctly stay hidden for the wrong reason.
    await reloadWithFreshCache(page);

    // Under the Algerian regime the two boxes are part of the form.
    const cashSale = page.getByText(/vente au comptant/i);
    await expect(cashSale).toBeVisible();

    // The flag stays set; only the regime moves.
    await setProfile(page, "FR", 20);
    const after = await apiGet(page, "/api/settings");
    expect(
      after.body.stamp_duty_enabled,
      "the switch is not reset — that is the whole point of the test"
    ).toBe(true);

    await page.goto("/fr/invoices/new");
    await reloadWithFreshCache(page);
    await expect(page.getByText(/désignation|description/i).first()).toBeVisible();
    await expect(cashSale).toHaveCount(0);
  });

  test("and the settings screen never offers the switch outside Algeria", async ({ page }) => {
    await signUp(page);
    await setProfile(page, "FR", 20);

    await page.goto("/fr/settings");
    await reloadWithFreshCache(page);
    await expect(page.locator('input[name="stamp_duty_enabled"]')).toHaveCount(0);
  });
});
