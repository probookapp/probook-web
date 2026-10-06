import { test, expect, type Page } from "@playwright/test";
import { signUp } from "./helpers";
import { apiDelete, apiGet, apiPost, setupClient, setupProduct } from "./api-helpers";

/**
 * The shopping list the open quotes add up to.
 *
 * Quoting goods that have run out is deliberate — a quote commits no stock. The
 * danger is that the shortfall stays invisible until someone accepts, so the
 * quotes page gathers it. What this pins down is mostly which quotes count:
 * a document that is archived, expired or already invoiced asks for nothing.
 */
async function quoteFor(
  page: Page,
  clientId: string,
  productId: string,
  quantity: number,
  status = "DRAFT"
) {
  const res = await apiPost(page, "/api/quotes", {
    client_id: clientId,
    issue_date: "2026-10-01",
    validity_date: "2026-11-01",
    status,
    lines: [
      { description: "Caméra", quantity, unit_price: 24500, tax_rate: 19, product_id: productId },
    ],
  });
  expect(res.status).toBe(200);
  return res.body as { id: string; quote_number: string };
}

const restock = async (page: Page) => {
  const res = await apiGet(page, "/api/quotes/restock");
  expect(res.status).toBe(200);
  return res.body as unknown as {
    designation: string;
    variant_name: string | null;
    missing: number;
    quantity_quoted: number;
    quantity_in_stock: number;
    quotes: { quote_number: string; quantity: number }[];
  }[];
};

test.describe("What the open quotes ask for and the stock cannot cover", () => {
  test("adds up every open quote, and counts the stock once", async ({ page }) => {
    await signUp(page);
    const client = await setupClient(page, "Client Réappro");
    const camera = await setupProduct(page, "Caméra IP extérieure", 24500, { quantity: 4 });
    const cable = await setupProduct(page, "Câble réseau", 1800, { quantity: 50 });

    await quoteFor(page, client.id as string, camera.id as string, 3);
    await quoteFor(page, client.id as string, camera.id as string, 6, "SENT");
    // Covered by stock: never a line in the list.
    await quoteFor(page, client.id as string, cable.id as string, 10);

    const rows = await restock(page);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      designation: "Caméra IP extérieure",
      quantity_quoted: 9,
      quantity_in_stock: 4,
      missing: 5,
    });
    expect(rows[0].quotes.map((q) => q.quantity).sort()).toEqual([3, 6]);
  });

  test("ignores a quote that is archived, expired or already invoiced", async ({ page }) => {
    await signUp(page);
    const client = await setupClient(page, "Client Réappro 2");
    const product = await setupProduct(page, "Caméra dôme", 18000, { quantity: 0 });

    const archived = await quoteFor(page, client.id as string, product.id as string, 2);
    await apiPost(page, `/api/quotes/${archived.id}/archive`);

    const expired = await quoteFor(page, client.id as string, product.id as string, 4, "EXPIRED");
    expect(expired.id).toBeTruthy();

    const invoiced = await quoteFor(page, client.id as string, product.id as string, 8, "ACCEPTED");
    const invoice = await apiPost(page, `/api/quotes/${invoiced.id}/convert-to-invoice`);
    expect(invoice.status).toBe(200);

    expect(await restock(page)).toEqual([]);

    // One live quote is enough to put the article back on the list.
    const live = await quoteFor(page, client.id as string, product.id as string, 7, "SENT");
    const rows = await restock(page);
    expect(rows).toHaveLength(1);
    expect(rows[0].missing).toBe(7);
    expect(rows[0].quotes.map((q) => q.quote_number)).toEqual([live.quote_number]);
  });

  test("counts a variant on its own shelf", async ({ page }) => {
    await signUp(page);
    const client = await setupClient(page, "Client Variantes");
    const product = await setupProduct(page, "T-shirt", 1500, { has_variants: true });
    const red = await apiPost(page, `/api/products/${product.id}/variants`, {
      name: "Rouge XL",
      quantity: 2,
    });
    const blue = await apiPost(page, `/api/products/${product.id}/variants`, {
      name: "Bleu M",
      quantity: 30,
    });

    await apiPost(page, "/api/quotes", {
      client_id: client.id,
      issue_date: "2026-10-01",
      validity_date: "2026-11-01",
      lines: [
        { description: "T-shirt — Rouge XL", quantity: 5, unit_price: 1500, tax_rate: 19, product_id: product.id, variant_id: red.body.id },
        { description: "T-shirt — Bleu M", quantity: 5, unit_price: 1500, tax_rate: 19, product_id: product.id, variant_id: blue.body.id },
      ],
    });

    const rows = await restock(page);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ variant_name: "Rouge XL", missing: 3 });
  });

  test("the quotes page shows the list and links to the quotes", async ({ page }) => {
    await signUp(page);
    const client = await setupClient(page, "Client Écran");
    const product = await setupProduct(page, "Caméra IP extérieure", 24500, { quantity: 1 });
    const quote = await quoteFor(page, client.id as string, product.id as string, 4, "SENT");

    await page.goto("/en/quotes");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    const banner = page.getByRole("button", { name: /1 article to restock/i });
    await expect(banner).toBeVisible();
    await banner.click();

    await expect(page.getByText("3 to order")).toBeVisible();
    await expect(page.getByText("4 quoted · 1 in stock")).toBeVisible();

    await page.getByRole("button", { name: new RegExp(quote.quote_number) }).click();
    await expect(page).toHaveURL(new RegExp(`/quotes/${quote.id}$`));
  });

  test("an archived-then-restored quote comes back to the list", async ({ page }) => {
    await signUp(page);
    const client = await setupClient(page, "Client Retour");
    const product = await setupProduct(page, "Caméra fixe", 12000, { quantity: 0 });
    const quote = await quoteFor(page, client.id as string, product.id as string, 3, "SENT");

    await apiPost(page, `/api/quotes/${quote.id}/archive`);
    expect(await restock(page)).toEqual([]);

    // Un-archiving is a DELETE on the same route: putting a document away is
    // never destroying it, and taking it back out puts it back on the list.
    const unarchived = await apiDelete(page, `/api/quotes/${quote.id}/archive`);
    expect(unarchived.status).toBeLessThan(400);

    const rows = await restock(page);
    expect(rows.map((r) => r.missing)).toEqual([3]);
  });
});
