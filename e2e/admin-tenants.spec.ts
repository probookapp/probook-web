import { test, expect, type Page } from "@playwright/test";
import { signUp } from "./helpers";
import { setupPlatformAdmin, adminGet, adminPost } from "./admin-helpers";

type AnyRecord = Record<string, unknown>;

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

/** Find the tenant created by the most recent signUp, matched by its company name. */
async function tenantByName(page: import("@playwright/test").Page, name: string) {
  const res = await adminGet(page, "/api/admin/tenants");
  const list = res.body as unknown as AnyRecord[];
  const found = list.find((t) => t.name === name);
  expect(found, `tenant "${name}" should exist`).toBeTruthy();
  return found as AnyRecord;
}

test.describe("Admin tenants: impersonation", () => {
  test.beforeEach(async ({ page }) => {
    await gotoLoginStable(page);
  });

  test("impersonate sets the cookie and stop clears it", async ({ page }) => {
    const { company } = await signUp(page);
    await setupPlatformAdmin(page);
    const tenant = await tenantByName(page, company);

    // Impersonate → server sets the httpOnly impersonation cookie.
    const start = await adminPost(page, `/api/admin/tenants/${tenant.id}/impersonate`);
    expect(start.status).toBe(200);
    expect(start.body.success).toBe(true);
    expect(start.body.tenant_id).toBe(tenant.id);

    const cookiesAfterStart = await page.context().cookies();
    expect(
      cookiesAfterStart.some((c) => c.name === "probook_impersonate")
    ).toBe(true);

    // Stop impersonation → cookie removed.
    const stop = await adminPost(page, "/api/admin/tenants/stop-impersonation");
    expect(stop.status).toBe(200);

    const cookiesAfterStop = await page.context().cookies();
    expect(
      cookiesAfterStop.some((c) => c.name === "probook_impersonate")
    ).toBe(false);
  });
});

test.describe("Admin tenants: edit (UI)", () => {
  test.beforeEach(async ({ page }) => {
    await gotoLoginStable(page);
  });

  test("edit a tenant's name and slug through the modal", async ({ page }) => {
    const { company } = await signUp(page);
    await setupPlatformAdmin(page);
    const tenant = await tenantByName(page, company);

    // The edit action button lives in the mobile card layout.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en/admin/tenants");

    // Filter down to just our tenant so there is a single Edit button.
    const search = page.locator('input[name="tenant-search"]');
    await search.fill(company);
    // The name renders in both the mobile card and the (DOM-present) desktop
    // table, so scope to the first match to avoid a strict-mode violation.
    await expect(page.getByText(company, { exact: false }).first()).toBeVisible();

    await page.getByRole("button", { name: "Edit" }).first().click();

    const newName = `${company} Renamed`;
    const newSlug = `renamed-${Date.now()}`;
    await page.locator('input[name="edit-tenant-name"]').fill(newName);
    await page.locator('input[name="edit-tenant-slug"]').fill(newSlug);

    const [resp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes(`/api/admin/tenants/${tenant.id}`) &&
          r.request().method() === "PUT"
      ),
      page.getByRole("button", { name: "Save" }).click(),
    ]);
    expect(resp.ok()).toBe(true);

    // Confirm the persisted change via the API.
    const after = await adminGet(page, `/api/admin/tenants/${tenant.id}`);
    expect(after.status).toBe(200);
    expect(after.body.name).toBe(newName);
    expect(after.body.slug).toBe(newSlug);
  });
});

test.describe("Admin tenants: per-tenant feature overrides", () => {
  test.beforeEach(async ({ page }) => {
    await gotoLoginStable(page);
  });

  test("force a feature ON for one tenant via the Features tab", async ({ page }) => {
    const { company } = await signUp(page);
    await setupPlatformAdmin(page);
    const tenant = await tenantByName(page, company);

    // A feature flag to override.
    const feature = await adminPost(page, "/api/admin/features", {
      key: `override_feat_${Date.now()}`,
      name: "Override Target Feature",
      is_global: false,
    });
    expect(feature.status).toBe(201);
    const featureId = feature.body.id as string;

    await page.goto(`/en/admin/tenants/${tenant.id}`);
    await page.getByRole("button", { name: "Features" }).click();

    const select = page.locator(`select[name="feature-${featureId}"]`);
    await expect(select).toBeVisible();
    await select.selectOption("on");

    const [resp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes(`/api/admin/features/tenant/${tenant.id}`) &&
          r.request().method() === "PUT"
      ),
      page.getByRole("button", { name: "Save overrides" }).click(),
    ]);
    expect(resp.ok()).toBe(true);

    // Assert the override was persisted with enabled = true.
    const overrides = await adminGet(page, `/api/admin/features/tenant/${tenant.id}`);
    expect(overrides.status).toBe(200);
    const mine = (overrides.body as unknown as AnyRecord[]).find(
      (o) => o.feature_id === featureId
    );
    expect(mine, "override row for the feature should exist").toBeTruthy();
    expect((mine as AnyRecord).enabled).toBe(true);
  });
});
