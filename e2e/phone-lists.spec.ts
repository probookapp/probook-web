import { test, expect, type Page } from "@playwright/test";
import { signUp } from "./helpers";
import { apiPost, apiPut, setupClient, setupIssuedInvoice, setupProduct, setupSupplier } from "./api-helpers";
import { setupPlatformAdmin } from "./admin-helpers";

/**
 * Every list on the smallest phone in use (320 px).
 *
 * The complaint that started this: on a phone the header, its buttons and the
 * filter chips took the whole first screen, the "New …" button scrolled away
 * with the page, and the cards led with a reference number instead of the
 * client. These checks hold the fix in place:
 *
 * - nothing scrolls sideways;
 * - the first record starts on the first screen, not below it;
 * - with the list scrolled to its end, the floating "+" is still on screen
 *   and does not sit on top of the last record's buttons.
 *
 * Each page also leaves a screenshot of its top and its end in the test's
 * output folder, for a look a test cannot take.
 */
const PHONE = { width: 320, height: 640 };
const LINE = [{ description: "Installation complète de vidéosurveillance", quantity: 3, unit_price: 125000, tax_rate: 19 }];

const TENANT_LISTS = [
  "clients",
  "products",
  "suppliers",
  "locations",
  "quotes",
  "invoices",
  "delivery-notes",
  "invoices/credit-notes",
  "purchases",
  "expenses",
];

const ADMIN_LISTS = [
  "admin/tenants",
  "admin/users",
  "admin/subscriptions",
  "admin/subscriptions/requests",
  "admin/subscription-invoices",
  "admin/coupons",
  "admin/referrals",
  "admin/platform-admins",
  "admin/rate-limits",
  "admin/features",
  "admin/data-requests",
  "admin/announcements",
  "admin/audit-logs",
];

const today = () => new Date().toISOString().slice(0, 10);

async function seed(page: Page) {
  const long = await setupClient(page, "Entreprise Benali Frères Import Export Algérie");
  const short = await setupClient(page, "Hôtel El Djazair");
  const product = await setupProduct(page, "Caméra IP extérieure varifocale 5MP infrarouge 60 m", 24500, { quantity: 12 });
  const supplier = await setupSupplier(page, "Société Générale de Câblage et Sécurité Numérique");
  const tag = await apiPost(page, "/api/tags", { name: "Chantier Hydra", color: "blue" });
  // A category brings up the products list's category filter beside its search.
  await apiPost(page, "/api/categories", { name: "Vidéosurveillance" });

  for (let i = 0; i < 9; i++) {
    const client = i % 2 ? short : long;
    const quote = await apiPost(page, "/api/quotes", { client_id: client.id, issue_date: today(), validity_date: today(), lines: LINE });
    if (i % 3 === 0 && tag.body?.id) await apiPut(page, `/api/quotes/${quote.body.id}/tags`, { tag_ids: [tag.body.id] });
    await apiPost(page, "/api/invoices", { client_id: client.id, issue_date: today(), lines: LINE });
    await apiPost(page, "/api/expenses", { name: `Carburant tournée ${i + 1}`, amount: 6800 + i, date: today(), category_name: "Carburant" });
  }
  const issued = await setupIssuedInvoice(page, { client_id: long.id, issue_date: today(), lines: LINE });
  await apiPost(page, `/api/invoices/${issued.body.id}/convert-to-delivery-note`);
  await apiPost(page, "/api/credit-notes", { client_id: long.id, issue_date: today(), restock: false, lines: LINE });
  await apiPost(page, "/api/purchases", {
    supplier_id: supplier.id,
    order_date: today(),
    lines: [{ product_id: product.id, quantity: 5, unit_price: 18000, tax_rate: 19 }],
  });
}

async function check(page: Page, route: string, problems: string[]) {
  await page.goto(`/fr/${route}`);
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  await expect(page.locator("h1").first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(300);

  const slug = route.replace(/\//g, "-");
  await page.screenshot({ path: test.info().outputPath(`${slug}-top.png`) });

  const layout = await page.evaluate(() => {
    const main = document.querySelector("main")!;
    const doc = document.documentElement;
    const list = document.querySelector("main .md\\:hidden.divide-y");
    const first = list?.firstElementChild as HTMLElement | null;
    return {
      overflow: Math.max(doc.scrollWidth - doc.clientWidth, main.scrollWidth - main.clientWidth),
      firstTop: first ? first.getBoundingClientRect().top : null,
    };
  });
  if (layout.overflow > 1) problems.push(`${route}: scrolls sideways by ${layout.overflow}px`);
  if (layout.firstTop !== null && layout.firstTop > PHONE.height - 40) {
    problems.push(`${route}: first record starts at ${Math.round(layout.firstTop)}px, below the first screen`);
  }

  await page.locator("main").evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath(`${slug}-end.png`) });

  const fab = page.locator("[data-fab]");
  if (await fab.count()) {
    if (!(await fab.isVisible())) problems.push(`${route}: the floating button is not visible at the end of the list`);
    // The last record's buttons must not sit under the floating button.
    const clash = await page.evaluate(() => {
      const fabBox = document.querySelector("[data-fab]")!.getBoundingClientRect();
      const list = document.querySelector("main .md\\:hidden.divide-y");
      const last = list?.lastElementChild;
      if (!last) return false;
      return Array.from(last.querySelectorAll("button")).some((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.left < fabBox.right && r.right > fabBox.left && r.top < fabBox.bottom && r.bottom > fabBox.top;
      });
    });
    if (clash) problems.push(`${route}: the floating button covers the last record's buttons`);
  }
}

test.describe("Lists on a 320 px phone", () => {
  test.use({ viewport: PHONE });

  test("tenant lists", async ({ page }) => {
    test.setTimeout(420_000);
    await signUp(page);
    await seed(page);
    const problems: string[] = [];
    for (const route of TENANT_LISTS) await check(page, route, problems);
    expect(problems, problems.join("\n")).toEqual([]);
  });

  test("admin lists", async ({ page }) => {
    test.setTimeout(420_000);
    await signUp(page);
    await setupPlatformAdmin(page);
    const problems: string[] = [];
    for (const route of ADMIN_LISTS) await check(page, route, problems);
    expect(problems, problems.join("\n")).toEqual([]);
  });
});
