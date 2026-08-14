import { test } from "@playwright/test";
import { signUp } from "./helpers";
import { setupClient, setupProduct, setupIssuedInvoice, apiPost } from "./api-helpers";

/**
 * French by default — the language the client and prospects see. Set
 * PREVIEW_LOCALE=ar (or en) to photograph the same screens in another
 * language, which is how the Arabic interface gets looked at rather than
 * assumed.
 */
const LOCALE = process.env.PREVIEW_LOCALE || "fr";

/**
 * Not an assertion — a camera.
 *
 * Judging a visual identity from a diff is guesswork, so this walks a real
 * tenant through the screens that carry the design and writes them to disk.
 * Inert unless asked for: `IDENTITY_PREVIEW=1 npx playwright test identity-preview`.
 */
const SHOTS = `identity-preview${process.env.PREVIEW_LOCALE ? "-" + process.env.PREVIEW_LOCALE : ""}`;

test.describe("Identity preview", () => {
  test.skip(!process.env.IDENTITY_PREVIEW, "set IDENTITY_PREVIEW=1 to capture");
  test.describe.configure({ mode: "serial", timeout: 180_000 });

  test("capture the screens that carry the design", async ({ page }) => {
    await signUp(page);

    // A blank tenant photographs as an empty state and proves nothing, so give
    // it enough life to show tables, badges, money columns and status chips.
    const client = await setupClient(page, "Atlas Électroménager");
    const tv = await setupProduct(page, "Téléviseur 55\"", 68000, { tax_rate: 19, purchase_price: 52000 });
    const cable = await setupProduct(page, "Câble HDMI 3 m", 1800, { tax_rate: 19, purchase_price: 900 });

    await setupIssuedInvoice(page, {
      client_id: client.id,
      issue_date: "2026-07-02",
      due_date: "2026-06-25", // deliberately past: shows the overdue chip
      lines: [
        { description: "Téléviseur 55\"", quantity: 2, unit_price: 68000, tax_rate: 19, product_id: tv.id },
        { description: "Câble HDMI 3 m", quantity: 4, unit_price: 1800, tax_rate: 19, product_id: cable.id },
      ],
    });
    await setupIssuedInvoice(page, {
      client_id: client.id,
      issue_date: "2026-07-20",
      due_date: "2026-09-30",
      lines: [{ description: "Installation et mise en service", quantity: 1, unit_price: 24000, tax_rate: 19 }],
    });
    await apiPost(page, "/api/quotes", {
      client_id: client.id,
      issue_date: "2026-08-01",
      lines: [{ description: "Téléviseur 55\"", quantity: 3, unit_price: 68000, tax_rate: 19, product_id: tv.id }],
      discount_percent: 5,
    });

    const routes = [
      ["dashboard", "01-tableau-de-bord"],
      ["invoices", "02-factures"],
      ["quotes", "03-devis"],
      ["products", "04-produits"],
      ["clients", "05-clients"],
      ["reports", "06-rapports"],
      ["settings", "07-parametres"],
    ] as const;

    // ── desktop ──
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const [route, name] of routes) {
      await page.goto(`/${LOCALE}/${route}`);
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${SHOTS}/desktop-${name}.png`, fullPage: false });
    }

    // ── the form, where every field primitive shows at once ──
    await page.goto(`/${LOCALE}/quotes/new`);
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}/desktop-08-nouveau-devis.png` });

    // ── phone ──
    await page.setViewportSize({ width: 390, height: 844 });
    for (const [route, name] of routes.slice(0, 4)) {
      await page.goto(`/${LOCALE}/${route}`);
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${SHOTS}/mobile-${name}.png` });
    }

    await page.goto(`/${LOCALE}/quotes/new`);
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}/mobile-08-nouveau-devis.png` });
  });
});
