import { test, expect, type Page } from "@playwright/test";
import { signUp } from "./helpers";
import { setupPlatformAdmin, adminGet } from "./admin-helpers";

/**
 * The admin dashboard on a 390 px screen: every list must read as stacked cards
 * with no horizontal page scroll. The wide tables used to be the only rendering,
 * so each of these pages forced a sideways scroll on a phone.
 */

const MOBILE = { width: 390, height: 844 };

const PAGES: { path: string; heading: RegExp }[] = [
  { path: "/en/admin/coupons", heading: /coupons/i },
  { path: "/en/admin/features", heading: /feature/i },
  { path: "/en/admin/announcements", heading: /announcement/i },
  { path: "/en/admin/data-requests", heading: /data request/i },
  { path: "/en/admin/platform-admins", heading: /platform admin/i },
  { path: "/en/admin/referrals", heading: /referral/i },
  { path: "/en/admin/rate-limits", heading: /rate limit/i },
  { path: "/en/admin/subscription-invoices", heading: /invoice/i },
  { path: "/en/admin/tenants", heading: /tenants/i },
  { path: "/en/admin/users", heading: /users/i },
  { path: "/en/admin/subscriptions", heading: /subscriptions/i },
  { path: "/en/admin/subscriptions/requests", heading: /subscription requests/i },
  { path: "/en/admin/audit-logs", heading: /audit logs/i },
];

/** Width the document actually needs vs the width it has. */
async function horizontalOverflow(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

test.describe("Admin dashboard at 390 px", () => {
  test.use({ viewport: MOBILE });

  test("every list page stacks into cards without a sideways scroll", async ({ page }) => {
    await signUp(page);
    await setupPlatformAdmin(page);

    for (const target of PAGES) {
      await page.goto(target.path);
      await expect(page.getByRole("heading", { name: target.heading }).first()).toBeVisible({
        timeout: 30_000,
      });
      // Tables are desktop-only now; the card list is what a phone gets. Waiting
      // for it also keeps the overflow check off the loading spinner.
      await expect(page.locator(".md\\:hidden.divide-y").first()).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(".hidden.md\\:block").first()).toBeHidden();

      const { scrollWidth, clientWidth } = await horizontalOverflow(page);
      console.log(`[verify] ${target.path}: scrollWidth=${scrollWidth} clientWidth=${clientWidth}`);
      expect(scrollWidth, `${target.path} overflows horizontally`).toBeLessThanOrEqual(
        clientWidth + 1
      );

      await page.screenshot({
        path: `test-results/verify-mobile-${target.path.split("/").pop()}.png`,
      });
    }
  });
});

test.describe("Admin cards at 390 px", () => {
  test.use({ viewport: MOBILE });

  test("a tenant card opens the tenant and folds its actions into the row menu", async ({ page }) => {
    const { company } = await signUp(page);
    await setupPlatformAdmin(page);

    await page.goto("/en/admin/tenants");
    await page.locator('input[name="tenant-search"]').fill(company);
    const name = page.getByText(company, { exact: true }).filter({ visible: true }).first();
    await expect(name).toBeVisible({ timeout: 30_000 });

    // Same menu as the desktop row: Edit inline, the rest behind "More actions".
    const menu = page.getByRole("button", { name: "More actions" }).filter({ visible: true }).first();
    await menu.click();
    await expect(page.getByRole("menuitem", { name: /impersonate/i })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /delete/i })).toBeVisible();
    await page.keyboard.press("Escape");
    // The menu closing does not count as a tap on the card.
    await expect(page).toHaveURL(/\/admin\/tenants$/);

    await name.click();
    await expect(page).toHaveURL(/\/admin\/tenants\/[^/]+$/, { timeout: 30_000 });
  });
});

test("rate limits reports tenant names, not just ids", async ({ page }) => {
  await signUp(page);
  await setupPlatformAdmin(page);

  const res = await adminGet(page, "/api/admin/rate-limits");
  const groups = res.body as unknown as Record<string, unknown>[];
  console.log("[verify] rate-limit groups:", groups.length);
  // The shape carries the name whether or not the test DB has flagged traffic.
  for (const group of groups) {
    expect(Object.keys(group)).toContain("tenant_name");
    expect(Object.keys(group)).toContain("tenant_slug");
  }
});

test("the invoice picker only loads subscriptions once its modal opens", async ({ page }) => {
  await signUp(page);
  await setupPlatformAdmin(page);

  const calls: string[] = [];
  page.on("request", (r) => {
    const url = r.url();
    // The unpaginated list call is the expensive one (every subscription).
    if (url.includes("/api/admin/subscriptions") && !url.includes("limit=")) calls.push(url);
  });

  await page.goto("/en/admin/subscription-invoices");
  await expect(page.getByRole("heading", { name: /invoice/i }).first()).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(1500);
  console.log("[verify] full-list calls on page load:", calls.length);
  expect(calls.length).toBe(0);

  await page.getByRole("button", { name: /new invoice/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect.poll(() => calls.length, { timeout: 15_000 }).toBeGreaterThan(0);
  console.log("[verify] full-list calls after opening the modal:", calls.length);

  // And the picker is the searchable one, not a raw select.
  await expect(page.getByRole("dialog").getByText(/select a subscription/i)).toBeVisible();
});
