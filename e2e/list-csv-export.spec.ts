import { test, expect, type Page } from "@playwright/test";
import { apiPost, setupClient, setupProduct } from "./api-helpers";
import { signUpSubscribed } from "./subscription-setup";

const today = () => new Date().toISOString().slice(0, 10);

/** Navigate to a list page, assert the Export CSV button is present + enabled,
 *  click it and confirm a real download is triggered. */
async function assertCsvExport(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");

  const button = page.getByRole("button", { name: "Export CSV" });
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    button.click(),
  ]);
  expect(download.suggestedFilename()).toContain(".csv");
}

test.describe("List CSV export", () => {
  test.beforeEach(async ({ page }) => {
    await signUpSubscribed(page);
  });

  test("Clients list exports CSV", async ({ page }) => {
    await setupClient(page, "CSV Client A");
    await setupClient(page, "CSV Client B");
    await assertCsvExport(page, "/en/clients");
  });

  test("Products list exports CSV", async ({ page }) => {
    await setupProduct(page, "CSV Product A", 10);
    await setupProduct(page, "CSV Product B", 20);
    await assertCsvExport(page, "/en/products");
  });

  test("Invoices list exports CSV", async ({ page }) => {
    const client = await setupClient(page, "CSV Invoice Client");
    for (let i = 0; i < 2; i++) {
      await apiPost(page, "/api/invoices", {
        client_id: client.id,
        issue_date: today(),
        lines: [{ description: `Line ${i}`, quantity: 1, unit_price: 100, tax_rate: 0 }],
      });
    }
    await assertCsvExport(page, "/en/invoices");
  });

  test("Quotes list exports CSV", async ({ page }) => {
    const client = await setupClient(page, "CSV Quote Client");
    for (let i = 0; i < 2; i++) {
      await apiPost(page, "/api/quotes", {
        client_id: client.id,
        issue_date: today(),
        validity_date: today(),
        lines: [{ description: `Line ${i}`, quantity: 1, unit_price: 100, tax_rate: 0 }],
      });
    }
    await assertCsvExport(page, "/en/quotes");
  });
});
