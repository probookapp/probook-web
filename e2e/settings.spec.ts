import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";
import { apiGet, apiPut } from "./api-helpers";

test.describe("Company settings", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("read default settings", async ({ page }) => {
    const res = await apiGet(page, "/api/settings");
    expect(res.status).toBe(200);
    expect(res.body.company_name).toBeTruthy();
    expect(res.body.default_tax_rate).toBeDefined();
    expect(res.body.invoice_prefix).toBeTruthy();
    expect(res.body.quote_prefix).toBeTruthy();
  });

  test("update settings", async ({ page }) => {
    const updated = await apiPut(page, "/api/settings", {
      company_name: "New Company Name",
      address: "789 Business St",
      default_tax_rate: 19,
      invoice_prefix: "FA-",
      quote_prefix: "DV-",
      currency: "DZD",
    });

    expect(updated.status).toBe(200);
    expect(updated.body.company_name).toBe("New Company Name");
    expect(updated.body.default_tax_rate).toBe(19);
    expect(updated.body.invoice_prefix).toBe("FA-");
    expect(updated.body.currency).toBe("DZD");
  });

  test("updated invoice prefix reflects in new invoices", async ({ page }) => {
    // Set custom prefix
    await apiPut(page, "/api/settings", { invoice_prefix: "CUSTOM-" });

    // Create a client and invoice
    const clientRes = await (await import("./api-helpers")).apiPost(page, "/api/clients", { name: "Prefix Client" });
    const invRes = await (await import("./api-helpers")).apiPost(page, "/api/invoices", {
      client_id: clientRes.body.id,
      issue_date: "2024-06-01",
      lines: [{ description: "Test", quantity: 1, unit_price: 10, tax_rate: 0 }],
    });

    expect(invRes.body.invoice_number).toMatch(/^CUSTOM-/);
  });
});
