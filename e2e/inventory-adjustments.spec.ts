import { test, expect, type Page } from "@playwright/test";
import { apiGet, apiPost, setupProduct, setupSupplier } from "./api-helpers";
import { signUpSubscribed } from "./subscription-setup";

/**
 * Inventory adjustment, reporting, and partial goods-receipt e2e coverage.
 * Each test signs up its own fresh tenant. Single-location tenant here, so the
 * adjust-stock modal shows no location picker.
 */

/** Locator for the currently-open Modal overlay (`.fixed.inset-0.z-50`). */
function modal(page: Page) {
  return page.locator(".fixed.inset-0.z-50");
}

test.describe("Inventory adjustments", () => {
  test.beforeEach(async ({ page }) => {
    await signUpSubscribed(page);
  });

  test("manual adjustment updates quantity and writes a stock movement", async ({
    page,
  }) => {
    const product = await setupProduct(page, "Adjust Widget", 100, { quantity: 10 });

    await page.goto("/en/products");
    await expect(page.getByRole("cell", { name: "Adjust Widget" })).toBeVisible();

    // Open the adjust-stock modal, switch to delta mode and add +5.
    await page.getByRole("button", { name: "Adjust Stock" }).click();
    const dialog = modal(page);
    await dialog.getByRole("button", { name: "Add / Remove" }).click();
    await dialog.getByRole("spinbutton").fill("5");
    await dialog.getByRole("button", { name: "Apply" }).click();

    // Generous timeout: in dev the /adjust-stock route compiles on first hit,
    // so the success toast can take several seconds to appear.
    await expect(page.getByText("Stock adjusted")).toBeVisible({ timeout: 15_000 });

    // Quantity moved 10 → 15.
    const after = await apiGet(page, `/api/products/${product.id}`);
    expect(after.body.quantity).toBe(15);

    // A matching adjustment ledger row was written.
    const mov = await apiGet(page, `/api/products/${product.id}/movements`);
    const movements = mov.body as unknown as Array<{ type: string; quantity_change: number }>;
    expect(
      movements.some((m) => m.type === "adjustment" && m.quantity_change === 5)
    ).toBe(true);
  });

  test("low-stock and inventory-valuation reports render seeded data", async ({
    page,
  }) => {
    // qty 3 is at/under the default low-stock threshold (5); purchase_price drives valuation.
    const product = await setupProduct(page, "LowStock Widget", 100, {
      quantity: 3,
      purchase_price: 40,
    });

    await page.goto("/en/reports");

    // ── Low Stock tab ───────────────────────────────────────────────────
    await page.getByRole("button", { name: "Low Stock" }).click();
    await expect(page.getByText("LowStock Widget")).toBeVisible();
    // Sanity check the underlying report data.
    const low = await apiGet(page, "/api/reports/low-stock");
    const lowRows = low.body as unknown as Array<{ product_id: string; quantity: number }>;
    expect(lowRows.some((r) => r.product_id === product.id && r.quantity === 3)).toBe(true);

    // ── Inventory Valuation tab ─────────────────────────────────────────
    await page.getByRole("button", { name: "Inventory Valuation" }).click();
    await expect(page.getByText("LowStock Widget")).toBeVisible();
    const val = await apiGet(page, "/api/reports/inventory-valuation");
    const valRows = val.body as unknown as Array<{
      product_id: string;
      quantity: number;
      stock_value: number;
    }>;
    const row = valRows.find((r) => r.product_id === product.id);
    expect(row?.quantity).toBe(3);
    expect(row?.stock_value).toBe(120); // 3 * 40
  });

  test("partial goods receipt sets status to PARTIALLY_RECEIVED and adds the received delta", async ({
    page,
  }) => {
    const supplier = await setupSupplier(page, "Receipt Supplier");
    const product = await setupProduct(page, "Receipt Product", 100, { quantity: 0 });

    // Purchase order for 10 units.
    const po = await apiPost(page, "/api/purchases", {
      supplier_id: supplier.id,
      lines: [{ product_id: product.id, quantity: 10, unit_price: 40 }],
    });
    expect(po.status).toBe(200);
    const poId = po.body.id as string;

    await page.goto("/en/purchases");
    await expect(page.getByRole("cell", { name: /Receipt Supplier/ }).first()).toBeVisible();

    // Open the confirm/receive modal (CheckCircle "Confirm Receipt" action).
    await page
      .getByRole("row", { name: /Receipt Supplier/ })
      .getByRole("button", { name: "Confirm Receipt" })
      .click();

    const dialog = modal(page);
    // Receive only 4 of the 10 ordered (aria-label "Received" on the qty input).
    await dialog.getByLabel("Received").fill("4");
    // The modal's confirm button carries visible text; the row's icon button is
    // outside this overlay, so scoping to the modal disambiguates.
    await dialog.getByRole("button", { name: "Confirm Receipt" }).click();

    // Status badge flips to "Partially Received" on the PO row (scoped to the
    // row so we don't match the identically-named status filter chip).
    await expect(
      page.getByRole("row", { name: /Receipt Supplier/ }).getByText("Partially Received")
    ).toBeVisible();

    // Assert via API: status + stock increased only by the received delta (4).
    const poAfter = await apiGet(page, `/api/purchases/${poId}`);
    expect(poAfter.body.status).toBe("PARTIALLY_RECEIVED");
    const prod = await apiGet(page, `/api/products/${product.id}`);
    expect(prod.body.quantity).toBe(4);
  });
});
