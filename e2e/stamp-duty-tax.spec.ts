import { test, expect, type Page } from "@playwright/test";
import { apiGet, apiPost, apiPut, setupClient } from "./api-helpers";
import { signUpSubscribed } from "./subscription-setup";

const today = () => new Date().toISOString().slice(0, 10);
const yearAgo = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
};

test.describe("Stamp duty & tax reporting", () => {
  test.beforeEach(async ({ page }) => {
    await signUpSubscribed(page);
  });

  test("enabling stamp duty in Settings applies droit de timbre to an issued invoice", async ({
    page,
  }) => {
    // ── Enable stamp duty via the Settings UI (toggle + 1% rate) ──────────────
    await page.goto("/en/settings");
    await page.waitForLoadState("networkidle");

    // The account was created without an email, so the Company Information form's
    // Email field defaults to "" which fails the `.email()` rule and blocks the
    // whole form save. Fill a valid email so the (unrelated) save can proceed.
    // NOTE: app bug — an empty email should be treated as "unset", not invalid.
    await page.getByLabel("Email", { exact: true }).fill("owner@example.com");

    await page.getByText("Apply stamp duty on cash payments").click();
    await page.getByLabel("Stamp duty rate (%)").fill("1");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Settings saved successfully!")).toBeVisible({ timeout: 15_000 });

    // Confirm the setting persisted.
    const settings = await apiGet(page, "/api/settings");
    expect(settings.body.stamp_duty_enabled).toBe(true);
    expect(settings.body.stamp_duty_rate).toBe(1);

    // ── Issue a CASH invoice (total 1000, 0% VAT) => stamp duty snapshot = 10 ──
    // Droit de timbre only applies to cash-settled invoices, so the sale must be
    // flagged is_cash_sale (the invoice form defaults this on when timbre is
    // enabled; here we set it explicitly since we post via the API).
    const client = await setupClient(page, "Timbre Client");
    const inv = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: today(),
      is_cash_sale: true,
      lines: [{ description: "Cash sale", quantity: 1, unit_price: 1000, tax_rate: 0 }],
    });
    expect(inv.status).toBe(200);
    const issued = await apiPost(page, `/api/invoices/${inv.body.id}/issue`);
    expect(issued.status).toBe(200);

    // API: stamp_duty is 1% of the 1000 total.
    const fetched = await apiGet(page, `/api/invoices/${inv.body.id}`);
    expect(fetched.body.stamp_duty).toBe(10);

    // Invoice view shows the stamp-duty line + total-with-timbre (1010).
    await page.goto(`/en/invoices/${inv.body.id}`);
    await page.waitForLoadState("networkidle");
    // Match the stamp-duty line item specifically ("Stamp duty (1%)"); a plain
    // "Stamp duty" substring also matches "Total payable (incl. stamp duty)".
    await expect(page.getByText(/Stamp duty \(\d/)).toBeVisible();
    await expect(page.getByText("Total payable (incl. stamp duty)")).toBeVisible();
    // The 1,010 total-with-timbre is rendered in several places (totals block +
    // summary paragraphs), so scope to the first match.
    await expect(page.getByText(/1[\s,.]?010/).first()).toBeVisible();

    // Client statement/balance includes the timbre: closing = 1000 + 10.
    const stmt = await apiGet(page, `/api/clients/${client.id}/statement`);
    expect((stmt.body.totals as Record<string, number>).closing_balance).toBe(1010);
    const balances = await apiGet(page, "/api/clients/balances");
    const entry = (balances.body as unknown as Array<Record<string, unknown>>).find(
      (b) => b.client_id === client.id
    );
    expect((entry as Record<string, number>).balance).toBe(1010);
  });

  test("tax summary report renders sales VAT and stamp-duty-due figures", async ({ page }) => {
    // Enable stamp duty (via API — the UI toggle is covered above).
    const upd = await apiPut(page, "/api/settings", {
      stamp_duty_enabled: true,
      stamp_duty_rate: 1,
    });
    expect(upd.status).toBe(200);

    // Seed a sale (total 1200 incl. 200 VAT) fully paid in cash.
    const client = await setupClient(page, "Tax Client");
    const inv = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: today(),
      lines: [{ description: "Taxable sale", quantity: 1, unit_price: 1000, tax_rate: 20 }],
    });
    expect(inv.status).toBe(200);
    await apiPost(page, `/api/invoices/${inv.body.id}/issue`);
    const pay = await apiPost(page, "/api/payments", {
      invoice_id: inv.body.id,
      amount: 1200,
      payment_date: today(),
      payment_method: "CASH",
    });
    expect(pay.status).toBe(200);

    // ── API cross-check ──────────────────────────────────────────────────────
    const summary = await apiGet(
      page,
      `/api/reports/tax-summary?startDate=${yearAgo()}&endDate=${today()}`
    );
    expect(summary.status).toBe(200);
    expect((summary.body.sales as Record<string, number>).total_vat).toBe(200);
    const stampDuty = summary.body.stamp_duty as Record<string, number | boolean>;
    expect(stampDuty.enabled).toBe(true);
    // 1% of the 1200 cash payment.
    expect(stampDuty.amount_due).toBe(12);

    // ── UI: open the Tax Summary report tab ──────────────────────────────────
    await page.goto("/en/reports");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Tax Summary" }).click();

    // Collected-VAT and stamp-duty-due cards render.
    await expect(page.getByText("Collected VAT (sales)")).toBeVisible();
    await expect(page.getByText("Stamp duty due")).toBeVisible();
    // Sales VAT value (200) and stamp duty due value (12) appear.
    await expect(page.getByText(/\b200\b/).first()).toBeVisible();
    await expect(page.getByText(/\b12\b/).first()).toBeVisible();
  });
});
