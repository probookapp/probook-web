import { test, expect, type Page } from "@playwright/test";
import { signUp, stubServiceWorker } from "./helpers";
import { setupPlatformAdmin, adminGet, adminPost } from "./admin-helpers";

/**
 * The last batch of admin work: bulk queue actions, the tenant invoices tab,
 * clearing rate-limit flags, the subscription-mix card, and the search boxes
 * that the remaining lists were missing.
 */

type AnyRecord = Record<string, unknown>;

async function tenantByName(page: Page, name: string) {
  const res = await adminGet(page, `/api/admin/tenants?search=${encodeURIComponent(name)}`);
  const found = (res.body as unknown as AnyRecord[]).find((t) => t.name === name);
  expect(found, `tenant "${name}" should exist`).toBeTruthy();
  return found as AnyRecord;
}

async function createPlan(page: Page, tag: string) {
  const res = await adminPost(page, "/api/admin/plans", {
    slug: `${tag}-${Date.now()}`,
    name: `${tag} Plan ${Date.now()}`,
    monthly_price: 100000,
    yearly_price: 1000000,
    currency: "DZD",
  });
  expect(res.status).toBe(201);
  return res.body as AnyRecord;
}

test("invoices are filterable by tenant, and the tenant page shows them", async ({ page }) => {
  const creds = await signUp(page);
  await setupPlatformAdmin(page);
  const tenant = await tenantByName(page, creds.company);
  const plan = await createPlan(page, "inv-tab");

  // Granting a subscription raises its first invoice.
  await adminPost(page, "/api/admin/subscriptions", {
    tenant_id: tenant.id,
    plan_id: plan.id,
    billing_cycle: "monthly",
  });

  const mine = await adminGet(page, `/api/admin/subscription-invoices?tenant_id=${tenant.id}`);
  const rows = mine.body as unknown as AnyRecord[];
  console.log("[verify] invoices for the tenant:", rows.length);
  expect(rows.length).toBe(1);
  expect(rows.every((r) => r.tenant_id === tenant.id)).toBe(true);

  await page.goto(`/en/admin/tenants/${tenant.id}`);
  await page.getByRole("button", { name: "Invoices" }).click();
  await expect(page.getByText(String(rows[0].invoice_number))).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: "test-results/verify-tenant-invoices-tab.png" });
});

test("bulk approve settles several requests at once", async ({ page, browser }) => {
  await stubServiceWorker(page);
  await page.goto("/en/login");
  await setupPlatformAdmin(page);
  const plan = await createPlan(page, "bulk-req");

  // Three tenants, each with a pending request, each in its own context so the
  // previous tenant's session doesn't bounce the next signup to the dashboard.
  const companies: string[] = [];
  for (let i = 0; i < 3; i++) {
    const context = await browser.newContext();
    const tenantPage = await context.newPage();
    const creds = await signUp(tenantPage);
    companies.push(creds.company);
    await tenantPage.evaluate(async () => {
      await fetch("/api/test/verify-email", { method: "POST", credentials: "include" });
    });
    const res = await tenantPage.evaluate(async (planId) => {
      const r = await fetch("/api/subscription/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          plan_id: planId,
          billing_cycle: "monthly",
          request_type: "new",
          currency: "DZD",
        }),
      });
      return r.status;
    }, String(plan.id));
    expect(res).toBe(201);
    await context.close();
  }

  await page.goto("/en/admin/subscriptions/requests");
  await expect(page.getByRole("heading", { name: /subscription requests/i })).toBeVisible({
    timeout: 30_000,
  });
  // Narrow to this run's tenants, then take the whole (pending) page.
  // "E2E Co" is the prefix signUp gives every tenant it creates.
  await page.locator('input[name="request-search"]').fill(companies[0].split(" ").slice(0, 2).join(" "));
  await page.waitForTimeout(1200);

  const selectAll = page.getByRole("checkbox", { name: "Select all" });
  await selectAll.check();
  await expect(page.getByText(/selected/i).first()).toBeVisible();

  await page.getByRole("button", { name: "Approve selected" }).click();
  // The summary toast reports the tally rather than one toast per row.
  await expect(page.locator("[role=alert]").first()).toBeVisible({ timeout: 30_000 });
  console.log("[verify] bulk toast:", await page.locator("[role=alert]").first().innerText());
  await page.screenshot({ path: "test-results/verify-bulk-approve.png" });

  // Nothing pending is left for that search.
  await expect
    .poll(async () => (await page.getByRole("checkbox", { name: "Select row" }).count()), {
      timeout: 20_000,
    })
    .toBe(0);
});

test("rate-limit flags can be cleared", async ({ page }) => {
  await stubServiceWorker(page);
  await page.goto("/en/login");
  await setupPlatformAdmin(page);

  // Nothing flagged in the test DB, but the endpoint must exist and be audited.
  const cleared = await adminPost(page, "/api/admin/rate-limits/reset", {
    tenant_id: "00000000-0000-0000-0000-000000000000",
  });
  console.log("[verify] clear response:", cleared.status, JSON.stringify(cleared.body));
  expect(cleared.status).toBe(200);
  expect(typeof (cleared.body as AnyRecord).cleared).toBe("number");

  const missingId = await adminPost(page, "/api/admin/rate-limits/reset", {});
  expect(missingId.status).toBe(400);

  const logs = await adminGet(page, "/api/admin/audit-logs?action=rate_limit.clear");
  expect(((logs.body as { data: AnyRecord[] }).data || []).length).toBeGreaterThan(0);
});

test("the dashboard renders the subscription mix", async ({ page }) => {
  await signUp(page);
  await setupPlatformAdmin(page);
  const mix = await adminGet(page, "/api/admin/analytics/subscriptions");
  expect(mix.status).toBe(200);
  expect(mix.body.by_plan).toBeTruthy();

  await page.goto("/en/admin");
  await expect(page.getByText("Subscriptions by plan")).toBeVisible({ timeout: 30_000 });
});

test("every admin list page has a search box", async ({ page }) => {
  await signUp(page);
  await setupPlatformAdmin(page);

  const pages: { path: string; input: string }[] = [
    { path: "/en/admin/coupons", input: "coupon-search" },
    { path: "/en/admin/features", input: "feature-search" },
    { path: "/en/admin/announcements", input: "announcement-search" },
    { path: "/en/admin/data-requests", input: "data-request-search" },
    { path: "/en/admin/platform-admins", input: "platform-admin-search" },
    { path: "/en/admin/referrals", input: "referral-search" },
    { path: "/en/admin/plans", input: "plan-search" },
    { path: "/en/admin/subscriptions/requests", input: "request-search" },
  ];

  for (const target of pages) {
    await page.goto(target.path);
    const box = page.locator(`input[name="${target.input}"]`);
    await expect(box, `${target.path} should have a search box`).toBeVisible({ timeout: 30_000 });
    // And an export next to it.
    await expect(
      page.getByRole("button", { name: /export csv/i }).first(),
      `${target.path} should offer CSV`
    ).toBeVisible();
  }
  console.log("[verify] search + CSV present on", pages.length, "pages");
});
