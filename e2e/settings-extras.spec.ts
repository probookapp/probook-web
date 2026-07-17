import { test, expect, type Page } from "@playwright/test";
import { logIn } from "./helpers";
import { apiGet } from "./api-helpers";
import { signUpSubscribed, stubServiceWorker } from "./subscription-setup";

async function gotoSettings(page: Page) {
  await page.goto("/en/settings");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
}

test.describe("Printer management (Settings)", () => {
  test("add, edit and delete a printer config", async ({ page }) => {
    await signUpSubscribed(page);
    await gotoSettings(page);

    // The printer form is uniquely identified by the address placeholder
    // (its inputs have no id/name binding, so label association is unavailable).
    const modalForm = page
      .locator("form")
      .filter({ has: page.getByPlaceholder("e.g. 192.168.1.50:9100") });

    // ── Add ──────────────────────────────────────────────────────────────
    await page.getByRole("button", { name: "Add Printer" }).click();
    // First textbox in the form is the printer name; the second is the address.
    await modalForm.getByRole("textbox").first().fill("Front Desk Printer");
    await modalForm.getByPlaceholder("e.g. 192.168.1.50:9100").fill("192.168.1.50:9100");
    await modalForm.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { name: "Add Printer" })).toHaveCount(0);

    // Assert persisted via the REST endpoint.
    await expect
      .poll(async () => {
        const res = await apiGet(page, "/api/pos/printers");
        return (res.body as unknown as Array<Record<string, unknown>>).map(
          (p) => p.printer_name
        );
      })
      .toContain("Front Desk Printer");

    // ── Edit ─────────────────────────────────────────────────────────────
    const row = page.getByRole("row").filter({ hasText: "Front Desk Printer" });
    await row.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByRole("heading", { name: "Edit Printer" })).toBeVisible();
    await modalForm.getByRole("textbox").first().fill("Back Office Printer");
    await modalForm.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { name: "Edit Printer" })).toHaveCount(0);

    await expect
      .poll(async () => {
        const res = await apiGet(page, "/api/pos/printers");
        return (res.body as unknown as Array<Record<string, unknown>>).map(
          (p) => p.printer_name
        );
      })
      .toContain("Back Office Printer");

    // ── Delete ───────────────────────────────────────────────────────────
    page.on("dialog", (dialog) => dialog.accept());
    const editedRow = page.getByRole("row").filter({ hasText: "Back Office Printer" });
    await editedRow.getByRole("button", { name: "Delete" }).click();

    await expect
      .poll(async () => {
        const res = await apiGet(page, "/api/pos/printers");
        return (res.body as unknown as unknown[]).length;
      })
      .toBe(0);
  });
});

test.describe("Dashboard customization (Settings)", () => {
  test("hide a stat card + reorder persists to server and applies cross-device", async ({
    page,
    browser,
  }) => {
    const creds = await signUpSubscribed(page);
    await gotoSettings(page);

    // Toggle OFF the "Clients" stat card in the Dashboard Layout section. Scope
    // to list rows that carry a checkbox so the sidebar's "Clients" nav link
    // (also an <li>) is not matched.
    const clientsRow = page
      .locator("li")
      .filter({ has: page.getByRole("checkbox") })
      .filter({ hasText: "Clients" });
    await expect(clientsRow.getByRole("checkbox")).toBeChecked();
    await clientsRow.getByRole("checkbox").uncheck();

    // Reorder: move the first card down.
    await page.getByRole("button", { name: "Move down" }).first().click();

    // Server-side cross-check (also waits for the debounced saves to land).
    await expect
      .poll(async () => {
        const res = await apiGet(page, "/api/settings");
        const layout = res.body.dashboard_layout as
          | { hidden?: string[] }
          | null
          | undefined;
        return layout?.hidden ?? [];
      })
      .toContain("clients");

    // Reload the dashboard on this device: the hidden card is gone.
    await page.goto("/en/dashboard");
    await page.waitForLoadState("networkidle");
    // "Total clients" only appears in the Clients stat card's description.
    await expect(page.getByText("Total clients")).toBeHidden();
    // A non-hidden card still renders.
    await expect(page.getByText("Quotes created")).toBeVisible();

    // Cross-device simulation: fresh context, same credentials.
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    // Fresh context needs its own SW stub (see stubServiceWorker docs).
    await stubServiceWorker(page2);
    await logIn(page2, creds.username, creds.password);
    await page2.goto("/en/dashboard");
    await page2.waitForLoadState("networkidle");
    await expect(page2.getByText("Total clients")).toBeHidden();
    await context2.close();
  });
});

test.describe("Exposed POS / numbering settings", () => {
  test("change ticket prefix, low-stock threshold and next invoice number", async ({ page }) => {
    await signUpSubscribed(page);
    await gotoSettings(page);

    // Wait for the form to hydrate from the loaded settings.
    const ticketPrefix = page.getByLabel("Ticket Prefix");
    await expect(ticketPrefix).toHaveValue(/.+/);

    await ticketPrefix.fill("ZTK-");
    await page.getByLabel("Low Stock Threshold").fill("12");
    await page.getByLabel("Next Invoice Number").fill("42");
    // Account has no email → the Company form's Email field defaults to "" which
    // fails `.email()` and blocks the save. Fill a valid email so it can persist.
    // (App bug: empty email should be treated as unset, not invalid.)
    await page.getByLabel("Email", { exact: true }).fill("owner@example.com");

    // Save the company-settings form (scope the button to that form).
    await page
      .locator("form")
      .filter({ has: page.getByLabel("Ticket Prefix") })
      .getByRole("button", { name: "Save" })
      .click();

    await expect
      .poll(async () => {
        const res = await apiGet(page, "/api/settings");
        return {
          prefix: res.body.pos_ticket_prefix,
          threshold: res.body.pos_low_stock_threshold,
          nextInvoice: res.body.next_invoice_number,
        };
      })
      .toEqual({ prefix: "ZTK-", threshold: 12, nextInvoice: 42 });
  });
});
