import { test, expect, type Locator, type Page } from "@playwright/test";
import { signUp } from "./helpers";
import { apiGet, apiPost, setupClient, setupProduct } from "./api-helpers";

/**
 * Documents name the variant they sell.
 *
 * Stock for a product with variants is kept per variant. Until quotes, invoices
 * and delivery notes carried the variant, issuing an invoice for a red XL shirt
 * took the goods out of a product-level count that holds nothing, and the red
 * shirt's own count never moved.
 */
async function shirtWithVariants(page: Page) {
  const product = await setupProduct(page, "T-shirt coton", 1500, { has_variants: true });
  const red = await apiPost(page, `/api/products/${product.id}/variants`, {
    name: "Rouge XL",
    quantity: 10,
    price_override: 1800,
  });
  const blue = await apiPost(page, `/api/products/${product.id}/variants`, {
    name: "Bleu M",
    quantity: 0,
  });
  return { product, red: red.body, blue: blue.body };
}

const line = (extra: Record<string, unknown>) => ({
  description: "T-shirt coton — Rouge XL",
  quantity: 3,
  unit_price: 1800,
  tax_rate: 19,
  ...extra,
});

test.describe("Variants on documents", () => {
  test("issuing an invoice takes the stock out of the variant sold", async ({ page }) => {
    await signUp(page);
    const client = await setupClient(page, "Boutique Variantes");
    const { product, red } = await shirtWithVariants(page);

    const invoice = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: "2026-09-01",
      lines: [line({ product_id: product.id, variant_id: red.id })],
    });
    expect(invoice.status).toBe(200);
    expect((invoice.body.lines as Array<{ variant_id: string }>)[0].variant_id).toBe(red.id);

    const issued = await apiPost(page, `/api/invoices/${invoice.body.id}/issue`);
    expect(issued.status).toBe(200);

    const after = await apiGet(page, `/api/products/${product.id}/variants/${red.id}`);
    expect(after.body.quantity).toBe(7);
  });

  test("an invoice line for a product with variants cannot be issued without one", async ({ page }) => {
    await signUp(page);
    const client = await setupClient(page, "Boutique Sans Variante");
    const { product } = await shirtWithVariants(page);

    const invoice = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: "2026-09-01",
      lines: [line({ product_id: product.id })],
    });
    expect(invoice.status).toBe(200);

    const issued = await apiPost(page, `/api/invoices/${invoice.body.id}/issue`);
    expect(issued.status).toBe(400);
    expect(issued.body.code).toBe("VARIANT_REQUIRED");
  });

  test("a variant paired with another product is refused", async ({ page }) => {
    await signUp(page);
    const client = await setupClient(page, "Boutique Mélange");
    const { red } = await shirtWithVariants(page);
    const other = await setupProduct(page, "Casquette", 900, {});

    const mismatched = await apiPost(page, "/api/quotes", {
      client_id: client.id,
      issue_date: "2026-09-01",
      validity_date: "2026-10-01",
      lines: [line({ product_id: other.id, variant_id: red.id })],
    });
    expect(mismatched.status).toBe(400);
    expect(mismatched.body.code).toBe("INVALID_VARIANT");
  });

  test("the variant follows the quote into the invoice and the delivery note", async ({ page }) => {
    await signUp(page);
    const client = await setupClient(page, "Boutique Conversion");
    const { product, red } = await shirtWithVariants(page);

    const quote = await apiPost(page, "/api/quotes", {
      client_id: client.id,
      issue_date: "2026-09-01",
      validity_date: "2026-10-01",
      lines: [line({ product_id: product.id, variant_id: red.id })],
    });
    expect(quote.status).toBe(200);

    const invoice = await apiPost(page, `/api/quotes/${quote.body.id}/convert-to-invoice`);
    expect((invoice.body.lines as Array<{ variant_id: string }>)[0].variant_id).toBe(red.id);

    const note = await apiPost(page, `/api/quotes/${quote.body.id}/convert-to-delivery-note`);
    const noteBody = await apiGet(page, `/api/delivery-notes/${note.body.id}`);
    expect((noteBody.body.lines as Array<{ variant_id: string }>)[0].variant_id).toBe(red.id);
  });

  test("the quote editor asks for the variant and prices the line from it", async ({ page }) => {
    await signUp(page);
    await setupClient(page, "Boutique Écran");
    await shirtWithVariants(page);

    await page.goto("/en/quotes/new");
    const field = (label: string): Locator =>
      page
        .locator(`xpath=.//label[normalize-space(.)=${JSON.stringify(label)}]/..`)
        .filter({ visible: true })
        .first();
    const pick = async (root: Locator, search: string, option: string | RegExp) => {
      await root.locator("button").first().click();
      await page.locator('input[type="text"]').filter({ visible: true }).last().fill(search);
      await page.locator('li[role="option"]').filter({ hasText: option }).first().click();
    };

    await pick(field("Client *"), "Boutique", "Boutique Écran");
    await pick(field("Product"), "T-shirt", /T-shirt coton \(10\)/);

    // Without a variant the quote can't be saved.
    await expect(page.getByText("Choose the variant: stock is tracked for each one.").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Create Quote" })).toBeDisabled();

    await pick(field("Variant *"), "Rouge", /Rouge XL \(10\)/);
    await expect(page.getByLabel("Description", { exact: true }).first()).toHaveValue("T-shirt coton — Rouge XL");
    await expect(page.getByRole("button", { name: "Create Quote" })).toBeEnabled();
  });
});
