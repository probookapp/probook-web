import { test, expect, type Locator, type Page } from "@playwright/test";
import { signUp } from "./helpers";
import { apiGet, setupClient, setupProduct, setupSupplier } from "./api-helpers";

/** A labelled field's component root (Input or SearchableSelect). */
function field(scope: Page | Locator, label: string, index = 0) {
  return scope
    .locator(`xpath=.//label[normalize-space(.)=${JSON.stringify(label)}]/..`)
    .filter({ visible: true })
    .nth(index);
}

async function pick(page: Page, root: Locator, search: string, option: string | RegExp) {
  await root.locator("button").first().click();
  await root.locator('input[type="text"]').first().fill(search);
  await page.locator('li[role="option"]').filter({ hasText: option }).first().click();
}

test.describe("Quotes for goods not in stock", () => {
  // A quote commits no stock, so it may promise goods still to be ordered in.
  // The shortfall is shown, in red and on screen, but never used to refuse the quote.
  test("an out-of-stock product can be quoted, and the quote flags it", async ({ page }) => {
    await signUp(page);
    await setupClient(page, "Backorder Client");
    await setupProduct(page, "Backorder Lamp", 5000, { quantity: 0 });
    await setupProduct(page, "Shelf Lamp", 3000, { quantity: 10 });

    await page.goto("/en/quotes/new");
    await pick(page, field(page, "Client *"), "Backorder", "Backorder Client");
    await pick(page, field(page, "Product"), "Backorder", /Backorder Lamp \(out of stock\)/);
    await page.getByLabel("Qty", { exact: true }).first().fill("3");
    await expect(page.getByText("Out of stock: 3 requested, none on hand")).toBeVisible();

    const create = page.getByRole("button", { name: "Create Quote" });
    await expect(create).toBeEnabled();
    await create.click();
    await expect(page).toHaveURL(/\/en\/quotes$/);

    const quotes = await apiGet(page, "/api/quotes");
    const list = (Array.isArray(quotes.body) ? quotes.body : quotes.body.data) as Array<{ id: string }>;
    await page.goto(`/en/quotes/${list[0].id}`);
    await expect(page.getByText(/1 item on this quote isn't in stock/)).toBeVisible();
    await expect(page.getByText("Out of stock: 3 requested, none on hand").first()).toBeAttached();
  });
});

test.describe("New product from a purchase order", () => {
  test("a product created from an order line lands on that line, with no opening stock", async ({ page }) => {
    await signUp(page);
    await setupSupplier(page, "Fresh Goods Supplier");

    await page.goto("/en/purchases");
    await page.getByRole("button", { name: "New Purchase Order" }).first().click();
    const order = page.getByRole("dialog", { name: "New Purchase Order" });
    await pick(page, field(order, "Supplier *"), "Fresh", "Fresh Goods Supplier");

    await order.getByRole("button", { name: "New product" }).click();
    const productDialog = page.getByRole("dialog", { name: "New product" });
    await field(productDialog, "Designation *").locator("input").fill("Brand New Drill");
    await field(productDialog, "Selling Price (excl. VAT) *").locator("input").fill("9000");
    await field(productDialog, "Purchase Price (excl. VAT)").locator("input").fill("6500");
    // Stock arrives with the order, not from the product form.
    await expect(field(productDialog, "Quantity")).toHaveCount(0);
    await productDialog.getByRole("button", { name: "Create", exact: true }).click();

    // The product dialog closes; the order behind stays open and did not submit.
    await expect(productDialog).toHaveCount(0);
    await expect(order).toBeVisible();
    await expect(field(order, "Product *").locator("button").first()).toContainText("Brand New Drill");
    await expect(field(order, "Unit Price *").locator("input")).toHaveValue("6500");

    const purchases = await apiGet(page, "/api/purchases");
    const rows = (Array.isArray(purchases.body) ? purchases.body : purchases.body.data) as unknown[];
    expect(rows).toHaveLength(0);

    const products = await apiGet(page, "/api/products");
    const drill = (products.body as unknown as Array<{ designation: string; quantity: number }>).find(
      (p) => p.designation === "Brand New Drill"
    );
    expect(drill?.quantity).toBe(0);

    await order.getByRole("button", { name: "Create", exact: true }).click();
    await expect(order).toHaveCount(0);
    await expect
      .poll(async () => {
        const res = await apiGet(page, "/api/purchases");
        return ((Array.isArray(res.body) ? res.body : res.body.data) as unknown[]).length;
      })
      .toBe(1);
  });
});
