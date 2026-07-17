import { test, expect, type Page } from "@playwright/test";
import { signUp } from "./helpers";
import { apiGet } from "./api-helpers";

/**
 * Regression: importing a product with a positive quantity must seed a
 * per-location stock level at the tenant's default location (previously the
 * import path set Product.quantity but never wrote a stock_levels row, so
 * GET /api/products/[id]/stock-levels came back empty).
 */

interface StockLevelRow {
  location_name: string;
  location_type: string;
  quantity: number;
  variants: unknown[];
}

/** POST a CSV to /api/import/products from the browser context (multipart form). */
async function importProductsCsv(page: Page, csv: string) {
  return page.evaluate(async (csvText) => {
    const file = new File([csvText], "products.csv", { type: "text/csv" });
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/import/products", {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    return { status: r.status, body: await r.json() };
  }, csv);
}

test.describe("Import product stock levels", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("imported product with quantity seeds a default-location stock level", async ({
    page,
  }) => {
    // Header keys map straight to internal columns (designation/unit_price/quantity).
    const csv =
      "designation,unit_price,tax_rate,quantity,purchase_price\n" +
      "Imported Stock Item,150,20,42,90\n";

    const res = await importProductsCsv(page, csv);
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(1);
    expect(res.body.skipped).toBe(0);

    // Locate the imported product.
    const list = await apiGet(page, "/api/products");
    const products = list.body as unknown as Array<{ id: string; designation: string; quantity: number }>;
    const product = products.find((p) => p.designation === "Imported Stock Item");
    expect(product).toBeTruthy();
    expect(product!.quantity).toBe(42);

    // ── The regression assertion: a default-location stock level exists ──
    const levelsRes = await apiGet(page, `/api/products/${product!.id}/stock-levels`);
    expect(levelsRes.status).toBe(200);
    const levels = levelsRes.body as unknown as StockLevelRow[];
    expect(levels.length).toBe(1);
    expect(levels[0].quantity).toBe(42);
    // The lazily-created default location is named "Main".
    expect(levels[0].location_name).toBe("Main");

    // And the movements ledger recorded the initial import entry.
    const movRes = await apiGet(page, `/api/products/${product!.id}/movements`);
    const movements = movRes.body as unknown as Array<{
      type: string;
      quantity_change: number;
      reference_type: string | null;
    }>;
    expect(
      movements.some(
        (m) => m.type === "initial" && m.quantity_change === 42 && m.reference_type === "import"
      )
    ).toBe(true);
  });
});
