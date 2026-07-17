import { test, expect, type Page } from "@playwright/test";
import { apiGet, apiPost, apiDelete, setupProduct } from "./api-helpers";
import { signUpSubscribed } from "./subscription-setup";

/**
 * Multi-location + inventory e2e coverage.
 *
 * Each test signs up a fresh tenant (first user = ADMIN with full permissions).
 * The default "Main" location is created lazily by the stock engine the first
 * time a stock change happens — so we seed a stocked product via the API before
 * exercising the locations UI, which guarantees "Main" (the default) exists.
 */

/** Locator for the currently-open Modal overlay (`.fixed.inset-0.z-50`). */
function modal(page: Page) {
  return page.locator(".fixed.inset-0.z-50");
}

interface StockLevelRow {
  location_id: string;
  location_name: string;
  location_type: string;
  quantity: number;
  variants: { variant_id: string; variant_name: string | null; quantity: number }[];
}

async function stockLevels(page: Page, productId: string): Promise<StockLevelRow[]> {
  const res = await apiGet(page, `/api/products/${productId}/stock-levels`);
  expect(res.status).toBe(200);
  return res.body as unknown as StockLevelRow[];
}

interface LocationRow {
  id: string;
  name: string;
  is_default: boolean;
}

async function getLocations(page: Page): Promise<LocationRow[]> {
  const res = await apiGet(page, "/api/locations");
  expect(res.status).toBe(200);
  return res.body as unknown as LocationRow[];
}

test.describe("Multi-location", () => {
  test.beforeEach(async ({ page }) => {
    await signUpSubscribed(page);
  });

  test("locations CRUD via the Locations page (create, edit, blocked default delete)", async ({
    page,
  }) => {
    // Seed a stocked product so the lazily-created default "Main" location exists.
    await setupProduct(page, "Seed Product", 10, { quantity: 5 });

    await page.goto("/en/locations");
    // Default location should show up in the list.
    await expect(page.getByRole("row", { name: /Main/ })).toBeVisible();

    // ── Create a 2nd location ("Warehouse") via the UI ──────────────────
    await page.getByRole("button", { name: "New location" }).click();
    // The name Input has no id/name, so the <label> isn't associated — target
    // the first textbox inside the modal (name), then the type <select>.
    await modal(page).getByRole("textbox").first().fill("Warehouse");
    await modal(page).getByLabel("Type").selectOption({ label: "Warehouse" });
    await modal(page).getByRole("button", { name: "Create" }).click();

    await expect(page.getByRole("row", { name: /Warehouse/ })).toBeVisible();
    // Confirm via API too.
    let locations = await getLocations(page);
    expect(locations.some((l) => l.name === "Warehouse")).toBe(true);

    // ── Edit the new location ───────────────────────────────────────────
    await page
      .getByRole("row", { name: /Warehouse/ })
      .getByRole("button", { name: "Edit" })
      .click();
    const nameInput = modal(page).getByRole("textbox").first();
    await nameInput.fill("Warehouse North");
    await modal(page).getByRole("button", { name: "Save" }).click();

    await expect(page.getByRole("row", { name: /Warehouse North/ })).toBeVisible();
    locations = await getLocations(page);
    expect(locations.some((l) => l.name === "Warehouse North")).toBe(true);

    // ── Deleting the default location is blocked ────────────────────────
    // The UI disables the delete button on the default row…
    const mainRow = page.getByRole("row", { name: /Main/ });
    await expect(mainRow.getByRole("button", { name: "Delete" })).toBeDisabled();
    // …and the API surfaces the same rule as a 400 error.
    const defaultLocation = locations.find((l) => l.is_default);
    expect(defaultLocation).toBeTruthy();
    const del = await apiDelete(page, `/api/locations/${defaultLocation!.id}`);
    expect(del.status).toBe(400);
    expect(String(del.body.error)).toMatch(/default/i);
  });

  test("stock transfer Main → Warehouse moves quantities, aggregate unchanged", async ({
    page,
  }) => {
    // Seed a product with 100 on hand (creates "Main" + a Main stock level).
    const product = await setupProduct(page, "Transfer Product", 200, { quantity: 100 });
    // Second location via API; the UI transfer form only enables with 2+ locations.
    const wh = await apiPost(page, "/api/locations", { name: "Warehouse", type: "warehouse" });
    expect(wh.status).toBe(201);

    await page.goto("/en/locations");
    // Switch to the "Stock transfers" tab and open the transfer form.
    await page.getByRole("button", { name: "Stock transfers" }).click();
    await page.getByRole("button", { name: "New transfer" }).click();

    const dialog = modal(page);
    // from-location / to-location <select>s carry a name, so labels associate.
    await dialog.getByLabel("From").selectOption({ label: "Main" });
    await dialog.getByLabel("To").selectOption({ label: "Warehouse" });
    // Product is a SearchableSelect: click the trigger (shows the placeholder),
    // then pick the option from the dropdown listbox.
    await dialog.getByRole("button", { name: "Select a product" }).click();
    await dialog.getByRole("option", { name: "Transfer Product" }).click();
    // Quantity Input has no id/name — it's the only number input in the modal.
    await dialog.getByRole("spinbutton").fill("40");
    await dialog.getByRole("button", { name: "Create" }).click();

    // Success toast then the transfer appears in the list.
    await expect(page.getByText("Stock transfer created")).toBeVisible();

    // ── Assert quantities moved and aggregate is unchanged ──────────────
    const levels = await stockLevels(page, product.id as string);
    const main = levels.find((l) => l.location_name === "Main");
    const warehouse = levels.find((l) => l.location_name === "Warehouse");
    expect(main?.quantity).toBe(60); // 100 - 40
    expect(warehouse?.quantity).toBe(40);
    // Aggregate cache (Product.quantity) stays the sum across locations.
    const prod = await apiGet(page, `/api/products/${product.id}`);
    expect(prod.body.quantity).toBe(100);
  });

  test("adjust-stock targeting a location writes a per-location level + ledger row", async ({
    page,
  }) => {
    const product = await setupProduct(page, "Adjust Loc Product", 150, { quantity: 100 });
    const wh = await apiPost(page, "/api/locations", { name: "Warehouse", type: "warehouse" });
    expect(wh.status).toBe(201);

    await page.goto("/en/products");
    // ProductsPage renders both a mobile (md:hidden) and a desktop table view;
    // target the desktop table cell (role=cell) to avoid a duplicate-match.
    await expect(page.getByRole("cell", { name: "Adjust Loc Product" })).toBeVisible();

    // Open the adjust-stock modal (SlidersHorizontal icon button).
    await page.getByRole("button", { name: "Adjust Stock" }).click();

    const dialog = modal(page);
    // The location picker only appears with 2+ locations. It's the only <select>
    // in the modal (no variants here), so target it by role and pick Warehouse.
    await dialog.getByRole("combobox").selectOption({ label: "Warehouse" });
    // "Set quantity" mode is the default; set Warehouse on-hand to 30.
    await dialog.getByRole("spinbutton").fill("30");
    await dialog.getByRole("button", { name: "Apply" }).click();

    await expect(page.getByText("Stock adjusted")).toBeVisible();

    // ── Per-location level: Warehouse = 30, Main untouched at 100 ────────
    const levels = await stockLevels(page, product.id as string);
    expect(levels.find((l) => l.location_name === "Warehouse")?.quantity).toBe(30);
    expect(levels.find((l) => l.location_name === "Main")?.quantity).toBe(100);

    // ── Movements ledger records an adjustment of +30 ───────────────────
    const mov = await apiGet(page, `/api/products/${product.id}/movements`);
    expect(mov.status).toBe(200);
    const movements = mov.body as unknown as Array<{ type: string; quantity_change: number }>;
    expect(
      movements.some((m) => m.type === "adjustment" && m.quantity_change === 30)
    ).toBe(true);
  });

  test("product row shows a per-location stock breakdown with 2+ locations", async ({
    page,
  }) => {
    const product = await setupProduct(page, "Breakdown Product", 150, { quantity: 100 });
    const wh = await apiPost(page, "/api/locations", { name: "Warehouse", type: "warehouse" });
    const warehouseId = (wh.body as { id: string }).id;
    // Move some stock so both locations hold on-hand (Main 60 / Warehouse 40).
    const main = (await getLocations(page)).find((l) => l.is_default)!;
    const transfer = await apiPost(page, "/api/stock-transfers", {
      from_location_id: main.id,
      to_location_id: warehouseId,
      lines: [{ product_id: product.id, quantity: 40 }],
    });
    expect(transfer.status).toBe(201);

    await page.goto("/en/products");
    await expect(page.getByRole("cell", { name: "Breakdown Product" })).toBeVisible();

    // The MapPin "Stock by location" button only renders for multi-location tenants.
    const mapButton = page.getByRole("button", { name: "Stock by location" }).first();
    await expect(mapButton).toBeVisible();
    await mapButton.click();

    // The breakdown modal lists each location with its quantity.
    const dialog = modal(page);
    await expect(dialog.getByText("Main")).toBeVisible();
    await expect(dialog.getByText("Warehouse")).toBeVisible();
    await expect(dialog.getByText("60")).toBeVisible();
    await expect(dialog.getByText("40")).toBeVisible();

    // Cross-check the underlying data.
    const levels = await stockLevels(page, product.id as string);
    expect(levels.find((l) => l.location_name === "Main")?.quantity).toBe(60);
    expect(levels.find((l) => l.location_name === "Warehouse")?.quantity).toBe(40);
  });
});
