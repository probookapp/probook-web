import { test, expect, type Page } from "@playwright/test";
import { signUp } from "./helpers";
import { setupPlatformAdmin, adminGet, adminPut } from "./admin-helpers";

type AnyRecord = Record<string, unknown>;

async function tenantByName(page: Page, name: string) {
  const res = await adminGet(page, "/api/admin/tenants");
  const found = (res.body as unknown as AnyRecord[]).find((t) => t.name === name);
  expect(found, `tenant "${name}" should exist`).toBeTruthy();
  return found as AnyRecord;
}

/**
 * Navigate to the login page with the PWA service worker disabled. The real SW
 * calls clients.claim() then reloads the page via a controllerchange handler,
 * which can destroy an in-flight page.evaluate (setupPlatformAdmin) and produce
 * spurious "Failed to fetch" / "Execution context was destroyed" errors. These
 * specs don't exercise offline behavior, so stubbing SW registration keeps setup
 * deterministic. The init script also applies to later same-context navigations.
 */
async function gotoLoginStable(page: Page) {
  await page.addInitScript(() => {
    try {
      const sw = navigator.serviceWorker;
      if (sw) {
        const proto = Object.getPrototypeOf(sw) as ServiceWorkerContainer;
        proto.register = () =>
          Promise.reject(new Error("service worker disabled for e2e"));
      }
    } catch {
      /* ignore */
    }
  });
  await page.goto("/en/login");
  await page.waitForLoadState("networkidle");
}

test.describe("Admin dashboard (UI)", () => {
  test.beforeEach(async ({ page }) => {
    await gotoLoginStable(page);
  });

  test("date-range picker drives filtered analytics and the funnel renders", async ({ page }) => {
    await signUp(page); // ensures at least one tenant for the funnel
    await setupPlatformAdmin(page);

    await page.goto("/en/admin");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    // Onboarding funnel renders with its steps.
    await expect(page.getByText("Onboarding funnel")).toBeVisible();
    await expect(page.getByText("Company setup")).toBeVisible();

    // Setting a start date refetches the signup analytics with the filter.
    const [signupResp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/api/admin/analytics/signups") &&
          r.url().includes("startDate=")
      ),
      page.locator('input[name="analytics-start-date"]').fill("2025-01-01"),
    ]);
    expect(signupResp.ok()).toBe(true);

    // The reset control only appears once a range is active.
    await expect(page.getByRole("button", { name: "Reset" })).toBeVisible();
  });
});

test.describe("Admin audit logs (UI)", () => {
  test.beforeEach(async ({ page }) => {
    await gotoLoginStable(page);
  });

  test("tenant filter is a dropdown and filters the log", async ({ page }) => {
    const { company } = await signUp(page);
    await setupPlatformAdmin(page);
    const tenant = await tenantByName(page, company);

    // Generate an audit entry scoped to this tenant.
    const upd = await adminPut(page, `/api/admin/tenants/${tenant.id}`, { name: company });
    expect(upd.status).toBe(200);

    await page.goto("/en/admin/audit-logs");

    // The tenant filter is a native <select> (dropdown), not a free-text field.
    const tenantFilter = page.locator('select[name="tenant-filter"]');
    await expect(tenantFilter).toBeVisible();
    const tagName = await tenantFilter.evaluate((el) => el.tagName.toLowerCase());
    expect(tagName).toBe("select");

    // Selecting our tenant refetches the log filtered by tenantId.
    const [resp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/api/admin/audit-logs") &&
          r.url().includes(`tenantId=${tenant.id}`)
      ),
      tenantFilter.selectOption({ label: company }),
    ]);
    expect(resp.ok()).toBe(true);

    // The filtered result shows this tenant's activity. The action renders in
    // both the mobile card and desktop table (only one visible per viewport),
    // so scope to the visible match to avoid selecting the hidden copy.
    await expect(
      page.getByText("tenant.update").filter({ visible: true }).first()
    ).toBeVisible();
  });
});

test.describe("Admin rate limits (UI)", () => {
  test.beforeEach(async ({ page }) => {
    await gotoLoginStable(page);
  });

  test("rate-limits page loads (no longer orphaned)", async ({ page }) => {
    await setupPlatformAdmin(page);

    await page.goto("/en/admin/rate-limits");
    await expect(page.getByRole("heading", { name: "Rate Limits" })).toBeVisible();
    expect(page.url()).toContain("/admin/rate-limits");

    // Either the empty-state or a table of violations is rendered. The
    // "Flagged Endpoints" column header is always present, so the empty-state
    // message coexists with it; take the first match to assert either is shown.
    await expect(
      page
        .getByText("No rate limit violations found.")
        .or(page.getByText("Flagged Endpoints"))
        .first()
    ).toBeVisible();
  });
});

test.describe("Admin announcements (UI)", () => {
  test.beforeEach(async ({ page }) => {
    await gotoLoginStable(page);
  });

  test("create an announcement targeted at a tenant via the picker", async ({ page }) => {
    const { company } = await signUp(page);
    await setupPlatformAdmin(page);
    const tenant = await tenantByName(page, company);

    await page.goto("/en/admin/announcements");

    // The reach/dismissals column is present.
    await expect(page.getByRole("columnheader", { name: "Dismissals" })).toBeVisible();

    await page.getByRole("button", { name: "New Announcement" }).click();

    const title = `E2E Announcement ${Date.now()}`;
    await page.locator('input[name="announcement-title"]').fill(title);
    await page.locator('textarea[name="announcement-body"]').fill("Hello tenant.");

    // Choose the "Specific Tenant" target and pick the tenant from the picker.
    await page.locator('select[name="announcement-target-type"]').selectOption("tenant");
    const tenantPicker = page.locator('select[name="announcement-target-tenant"]');
    await expect(tenantPicker).toBeVisible();
    await tenantPicker.selectOption({ label: company });

    const [resp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/api/admin/announcements") &&
          r.request().method() === "POST"
      ),
      page.getByRole("button", { name: "Create", exact: true }).click(),
    ]);
    expect(resp.status()).toBe(201);

    // Verify the picker resolved to the real tenant id (not a raw-id free text).
    const list = await adminGet(page, "/api/admin/announcements");
    const mine = (list.body as unknown as AnyRecord[]).find((a) => a.title === title);
    expect(mine, "created announcement should be listed").toBeTruthy();
    expect((mine as AnyRecord).target_type).toBe("tenant");
    expect((mine as AnyRecord).target_id).toBe(tenant.id);
  });
});
