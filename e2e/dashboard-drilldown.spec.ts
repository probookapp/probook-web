import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";
import { apiPost, setupClient, setupIssuedInvoice } from "./api-helpers";

/**
 * A figure on the dashboard is a question; the answer is a list.
 *
 * These tests go through the UI on purpose — the point of the feature is the
 * navigation, not the query, and the state has to survive the trip through the
 * URL for the link to mean anything.
 */
test.describe("Dashboard drill-down", () => {
  test("the pending-payments card lands on the unpaid invoices", async ({ page }) => {
    await signUp(page);
    const client = await setupClient(page, "Pilotage SARL");
    const line = [{ description: "Prestation", quantity: 1, unit_price: 10000, tax_rate: 0 }];
    await apiPost(page, "/api/invoices", { client_id: client.id, issue_date: "2026-06-01", lines: line });
    await setupIssuedInvoice(page, {
      client_id: client.id,
      issue_date: "2026-06-02",
      lines: line,
    });

    await page.goto("/fr/dashboard");
    const card = page.getByRole("link", { name: /Paiements? en attente|En attente/i }).first();
    await expect(card).toBeVisible();
    await card.click();

    await expect(page).toHaveURL(/\/invoices\?status=ISSUED/);
    // Landing already filtered is the whole point: the draft must not be here.
    await expect(page.getByRole("button", { name: "Émise", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  test("choosing a state rewrites the URL without stacking history entries", async ({ page }) => {
    await signUp(page);

    await page.goto("/fr/invoices");
    await page.getByRole("button", { name: "Brouillon", exact: true }).click();
    await expect(page).toHaveURL(/status=DRAFT/);

    await page.getByRole("button", { name: "Payée", exact: true }).click();
    await expect(page).toHaveURL(/status=PAID/);

    // Three chips clicked, one history entry: back returns to the dashboard-less
    // starting point, not through every chip.
    await page.getByRole("button", { name: "Tous", exact: true }).click();
    await expect(page).not.toHaveURL(/status=/);
  });

  test("an unknown state in the URL falls back to showing everything", async ({ page }) => {
    await signUp(page);
    await page.goto("/fr/invoices?status=NOT_A_STATUS");
    await expect(page.getByRole("button", { name: "Tous", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });
});
