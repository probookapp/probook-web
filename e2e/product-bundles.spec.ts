import { test, expect, type Locator, type Page } from "@playwright/test";
import { signUp } from "./helpers";
import {
  apiDelete,
  apiGet,
  apiPost,
  apiPut,
  openSession,
  setupClient,
  setupProduct,
  setupRegister,
} from "./api-helpers";

/**
 * Packs: a product sold as one line, made of others.
 *
 * A camera installer sells "the camera, its connectors and the fitting" as one
 * priced offer. What leaves the shelves are the components, and each is taxed
 * at its own rate, so a document carries a pack as a header line (no value of
 * its own) followed by one line per component holding its share of the price.
 * These tests pin down the three things that make that true: the split, the
 * stock, and the VAT.
 */

type Line = {
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  subtotal: number;
  total: number;
  is_bundle_header: boolean;
  bundle_key: string | null;
};

async function cameraPack(page: Page) {
  // Bought separately: 20 000 + 4 x 500 + 8 000 = 30 000. Sold as a pack: 24 000.
  const camera = await setupProduct(page, "Caméra IP extérieure", 20000, {
    tax_rate: 19,
    quantity: 10,
    purchase_price: 12000,
  });
  const connector = await setupProduct(page, "Fiche RJ45", 500, {
    tax_rate: 19,
    quantity: 40,
    purchase_price: 150,
  });
  const fitting = await setupProduct(page, "Pose caméra", 8000, { tax_rate: 9, is_service: true });
  const pack = await setupProduct(page, "Pack caméra posée", 24000, { tax_rate: 19 });

  const composed = await apiPut(page, `/api/product-bundles/${pack.id}`, {
    components: [
      { product_id: camera.id, quantity: 1 },
      { product_id: connector.id, quantity: 4 },
      { product_id: fitting.id, quantity: 1 },
    ],
  });
  expect(composed.status).toBe(200);
  return { camera, connector, fitting, pack };
}

/** The pack line as the editors send it: its header, then its components at their share. */
const packLines = (ids: { pack: string; camera: string; connector: string; fitting: string }, qty = 1) => [
  {
    product_id: ids.pack,
    description: "Pack caméra posée",
    quantity: qty,
    unit_price: 24000,
    tax_rate: 0,
    is_bundle_header: true,
    bundle_key: "k1",
  },
  { product_id: ids.camera, description: "Caméra IP extérieure", quantity: qty, unit_price: 16000, tax_rate: 19, bundle_key: "k1" },
  { product_id: ids.connector, description: "Fiche RJ45", quantity: 4 * qty, unit_price: 400, tax_rate: 19, bundle_key: "k1" },
  { product_id: ids.fitting, description: "Pose caméra", quantity: qty, unit_price: 6400, tax_rate: 9, bundle_key: "k1" },
];

const stockOf = async (page: Page, id: unknown) =>
  (await apiGet(page, `/api/products/${id}`)).body.quantity as number | null;

test.describe("Packs", () => {
  test("a pack counts what its components can make up, and holds no stock of its own", async ({ page }) => {
    await signUp(page);
    const { pack } = await cameraPack(page);

    const read = await apiGet(page, `/api/products/${pack.id}`);
    expect(read.body.is_bundle).toBe(true);
    // Ten cameras, but forty connectors at four a pack: ten packs. The fitting
    // is a service and never limits it.
    expect(read.body.quantity).toBe(10);
    expect(read.body.purchase_price).toBe(12600);
    expect((read.body.bundle_components as unknown[]).length).toBe(3);

    const adjust = await apiPost(page, `/api/products/${pack.id}/adjust-stock`, { quantity_change: 5 });
    expect(adjust.status).toBe(400);
    expect(adjust.body.code).toBe("BUNDLE_NO_STOCK");
  });

  test("an issued invoice takes the components out of stock and charges each at its own rate", async ({ page }) => {
    await signUp(page);
    const client = await setupClient(page, "Résidence Les Pins");
    const { camera, connector, fitting, pack } = await cameraPack(page);
    const ids = { pack: pack.id, camera: camera.id, connector: connector.id, fitting: fitting.id } as Record<string, string>;

    const created = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: "2026-10-08",
      lines: packLines(ids as never, 2),
    });
    expect(created.status).toBe(200);
    const lines = created.body.lines as Line[];
    expect(lines).toHaveLength(4);
    const [header, ...children] = lines;
    expect(header).toMatchObject({ is_bundle_header: true, unit_price: 24000, subtotal: 48000, tax_rate: 0 });
    expect(children.every((c) => c.bundle_key === header.bundle_key)).toBe(true);

    // 2 x (16 000 + 1 600) at 19 %, 2 x 6 400 at 9 %; the header is never counted.
    expect(created.body.subtotal).toBe(48000);
    expect(created.body.tax_amount).toBe(Math.round(35200 * 0.19 + 12800 * 0.09));

    const issued = await apiPost(page, `/api/invoices/${created.body.id}/issue`);
    expect(issued.status).toBe(200);
    expect(await stockOf(page, camera.id)).toBe(8);
    expect(await stockOf(page, connector.id)).toBe(32);
    // Eight cameras left, thirty-two connectors (eight packs' worth): eight packs.
    expect(await stockOf(page, pack.id)).toBe(8);

    // The pack never got a shelf of its own.
    const movements = await apiGet(page, `/api/products/${pack.id}/movements`);
    expect((movements.body as unknown as unknown[]).length ?? 0).toBe(0);

    // The VAT return sees two rates, and the pack header nowhere.
    const tax = await apiGet(page, "/api/reports/tax-summary?startDate=2026-10-01&endDate=2026-10-31");
    const byRate = (tax.body.sales as { by_rate: { tax_rate: number; total_ht: number }[] }).by_rate;
    expect(byRate.find((r) => r.tax_rate === 19)?.total_ht).toBe(35200);
    expect(byRate.find((r) => r.tax_rate === 9)?.total_ht).toBe(12800);
    expect(byRate.find((r) => r.tax_rate === 0)).toBeUndefined();
  });

  test("a pack moves through quote, invoice and delivery note with its components", async ({ page }) => {
    await signUp(page);
    const client = await setupClient(page, "Villa Hydra");
    const { camera, connector, fitting, pack } = await cameraPack(page);
    const ids = { pack: pack.id, camera: camera.id, connector: connector.id, fitting: fitting.id } as Record<string, string>;

    const quote = await apiPost(page, "/api/quotes", {
      client_id: client.id,
      issue_date: "2026-10-08",
      validity_date: "2026-11-08",
      lines: packLines(ids as never),
    });
    expect(quote.status).toBe(200);

    const invoice = await apiPost(page, `/api/quotes/${quote.body.id}/convert-to-invoice`);
    expect(invoice.status).toBe(200);
    const invoiceLines = invoice.body.lines as Line[];
    expect(invoiceLines.filter((l) => l.is_bundle_header)).toHaveLength(1);
    expect(invoiceLines.filter((l) => l.bundle_key && !l.is_bundle_header)).toHaveLength(3);

    const note = await apiPost(page, `/api/invoices/${invoice.body.id}/convert-to-delivery-note`);
    expect(note.status).toBe(200);
    const noteLines = note.body.lines as Line[];
    expect(noteLines.map((l) => [l.is_bundle_header, l.quantity])).toEqual([
      [true, 1],
      [false, 1],
      [false, 4],
      [false, 1],
    ]);
  });

  test("a delivery note is billed at the pack price, split between its components", async ({ page }) => {
    await signUp(page);
    const client = await setupClient(page, "Chantier Bab Ezzouar");
    const { camera, connector, fitting, pack } = await cameraPack(page);

    const note = await apiPost(page, "/api/delivery-notes", {
      client_id: client.id,
      issue_date: "2026-10-08",
      lines: [
        { product_id: pack.id, description: "Pack caméra posée", quantity: 1, is_bundle_header: true, bundle_key: "n1" },
        { product_id: camera.id, description: "Caméra IP extérieure", quantity: 1, bundle_key: "n1" },
        { product_id: connector.id, description: "Fiche RJ45", quantity: 4, bundle_key: "n1" },
        { product_id: fitting.id, description: "Pose caméra", quantity: 1, bundle_key: "n1" },
      ],
    });
    expect(note.status).toBe(200);

    const invoice = await apiPost(page, `/api/delivery-notes/${note.body.id}/convert-to-invoice`);
    expect(invoice.status).toBe(200);
    const lines = invoice.body.lines as Line[];
    expect(lines[0]).toMatchObject({ is_bundle_header: true, unit_price: 24000 });
    expect(lines.slice(1).map((l) => [l.unit_price, l.tax_rate])).toEqual([
      [16000, 19],
      [400, 19],
      [6400, 9],
    ]);
    expect(invoice.body.subtotal).toBe(24000);
  });

  test("the till sells a pack through its components, and a cancellation puts them back", async ({ page }) => {
    await signUp(page);
    const { camera, connector, fitting, pack } = await cameraPack(page);
    const ids = { pack: pack.id, camera: camera.id, connector: connector.id, fitting: fitting.id } as Record<string, string>;
    const register = await setupRegister(page, "Caisse packs");
    const session = await openSession(page, register.id as string, 0);

    const sale = await apiPost(page, "/api/pos/transactions", {
      register_id: register.id,
      session_id: session.id,
      lines: packLines(ids as never).map(({ description, ...l }) => ({ ...l, designation: description })),
      // 24 000 HT: 17 600 at 19 % and 6 400 at 9 %.
      payments: [{ payment_method: "CARD", amount: 27920 }],
    });
    expect(sale.status).toBe(200);
    expect(sale.body.subtotal).toBeCloseTo(24000, 2);
    expect(await stockOf(page, camera.id)).toBe(9);
    expect(await stockOf(page, connector.id)).toBe(36);

    const cancelled = await apiPost(page, `/api/pos/transactions/${sale.body.id}/cancel`, { reason: "test" });
    expect(cancelled.status).toBe(200);
    expect(await stockOf(page, camera.id)).toBe(10);
    expect(await stockOf(page, connector.id)).toBe(40);
  });

  test("a pack cannot be sold without its components, nor hold another pack", async ({ page }) => {
    await signUp(page);
    const client = await setupClient(page, "Client Strict");
    const { camera, pack } = await cameraPack(page);

    const bare = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: "2026-10-08",
      lines: [{ product_id: pack.id, description: "Pack", quantity: 1, unit_price: 24000, tax_rate: 19 }],
    });
    expect(bare.status).toBe(400);
    expect(bare.body.code).toBe("INVALID_BUNDLE_LINES");

    const orphan = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: "2026-10-08",
      lines: [{ product_id: camera.id, description: "Caméra", quantity: 1, unit_price: 1, tax_rate: 19, bundle_key: "x" }],
    });
    expect(orphan.status).toBe(400);

    const other = await setupProduct(page, "Pack double", 50000);
    const nested = await apiPut(page, `/api/product-bundles/${other.id}`, {
      components: [{ product_id: pack.id, quantity: 1 }],
    });
    expect(nested.status).toBe(400);
    expect(nested.body.code).toBe("BUNDLE_NESTED");

    // A component cannot be deleted from under its pack.
    const removed = await apiDelete(page, `/api/products/${camera.id}`);
    expect(removed.status).toBe(409);
    expect(removed.body.code).toBe("PRODUCT_IN_BUNDLE");

    // Nor can a product holding stock turn into a pack.
    const stocked = await apiPut(page, `/api/product-bundles/${camera.id}`, { components: [] });
    expect(stocked.status).toBe(409);
  });

  test("a pack with variants is sold with the components of the variant chosen", async ({ page }) => {
    await signUp(page);
    const client = await setupClient(page, "Client Couleurs");
    const black = await setupProduct(page, "Caméra noire", 20000, { tax_rate: 19, quantity: 3 });
    const white = await setupProduct(page, "Caméra blanche", 20000, { tax_rate: 19, quantity: 7 });
    const fitting = await setupProduct(page, "Pose", 8000, { tax_rate: 9, is_service: true });
    const pack = await setupProduct(page, "Pack couleur", 25000, { has_variants: true });
    const vBlack = (await apiPost(page, `/api/products/${pack.id}/variants`, { name: "Noir" })).body;
    const vWhite = (await apiPost(page, `/api/products/${pack.id}/variants`, { name: "Blanc" })).body;

    const composed = await apiPut(page, `/api/product-bundles/${pack.id}`, {
      components: [
        { bundle_variant_id: vBlack.id, product_id: black.id, quantity: 1 },
        { bundle_variant_id: vWhite.id, product_id: white.id, quantity: 1 },
        // Shared by every variant.
        { product_id: fitting.id, quantity: 1 },
      ],
    });
    expect(composed.status).toBe(200);

    const read = await apiGet(page, `/api/products/${pack.id}`);
    const variants = read.body.variants as { id: string; quantity: number }[];
    expect(variants.find((v) => v.id === vBlack.id)?.quantity).toBe(3);
    expect(variants.find((v) => v.id === vWhite.id)?.quantity).toBe(7);

    const invoice = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: "2026-10-08",
      lines: [
        { product_id: pack.id, variant_id: vWhite.id, description: "Pack couleur — Blanc", quantity: 2, unit_price: 25000, tax_rate: 0, is_bundle_header: true, bundle_key: "v" },
        { product_id: white.id, description: "Caméra blanche", quantity: 2, unit_price: 17857.14, tax_rate: 19, bundle_key: "v" },
        { product_id: fitting.id, description: "Pose", quantity: 2, unit_price: 7142.86, tax_rate: 9, bundle_key: "v" },
      ],
    });
    expect(invoice.status).toBe(200);
    expect((await apiPost(page, `/api/invoices/${invoice.body.id}/issue`)).status).toBe(200);
    expect(await stockOf(page, white.id)).toBe(5);
    expect(await stockOf(page, black.id)).toBe(3);
  });

  test("the quote editor shows what a pack holds and saves it as its components", async ({ page }) => {
    await signUp(page);
    await setupClient(page, "Boutique Packs");
    await cameraPack(page);

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

    await pick(field("Client *"), "Boutique", "Boutique Packs");
    await pick(field("Product"), "Pack", /Pack caméra posée/);

    const contents = page.getByTestId("bundle-contents").filter({ visible: true }).first();
    await expect(contents).toContainText("4 × Fiche RJ45");
    await expect(contents).toContainText("Mixed VAT");
    await page.getByRole("spinbutton", { name: "Qty", exact: true }).first().fill("2");
    await expect(contents).toContainText("8 × Fiche RJ45");

    await page.getByRole("button", { name: "Create Quote" }).click();
    await page.waitForURL(/\/quotes$/);

    const quotes = await apiGet(page, "/api/quotes");
    const list = (quotes.body as unknown as { id: string }[]) ?? [];
    const first = Array.isArray(list) ? list[0] : (quotes.body.data as { id: string }[])[0];
    const saved = await apiGet(page, `/api/quotes/${first.id}`);
    const lines = saved.body.lines as Line[];
    expect(lines.map((l) => [l.is_bundle_header, l.quantity])).toEqual([
      [true, 2],
      [false, 2],
      [false, 8],
      [false, 2],
    ]);
    expect(saved.body.subtotal).toBe(48000);
  });
});
