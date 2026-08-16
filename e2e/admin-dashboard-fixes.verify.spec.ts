import { test, expect, type Page } from "@playwright/test";
import { signUp } from "./helpers";
import { apiGet } from "./api-helpers";
import { setupPlatformAdmin, adminGet, adminPost, adminPut, createTestPlan } from "./admin-helpers";

/**
 * Verification of the admin-dashboard remediation batch: plan archive/restore,
 * plan→feature entitlements, tenant feature "inherit", the tenants list plan and
 * trial columns, request pagination/search, audit-log paging and the dashboard
 * attention counters. Drives the real API through the browser plus the GUI where
 * the behaviour is visual.
 */

type AnyRecord = Record<string, unknown>;

async function tenantByName(page: Page, name: string) {
  const res = await adminGet(page, `/api/admin/tenants?search=${encodeURIComponent(name)}`);
  const found = (res.body as unknown as AnyRecord[]).find((t) => t.name === name);
  expect(found, `tenant "${name}" should exist`).toBeTruthy();
  return found as AnyRecord;
}

async function createPlan(page: Page, tag: string, extra: AnyRecord = {}) {
  const res = await createTestPlan(page, {
    slug: `${tag}-${Date.now()}`,
    // Unique per run: the shared test database is full of same-named plans.
    name: `${tag} Plan ${Date.now()}`,
    monthly_price: 100000,
    yearly_price: 1000000,
    currency: "DZD",
    ...extra,
  });
  expect(res.status).toBe(201);
  return res.body as AnyRecord;
}

test("plans: archive and restore actually flip is_active", async ({ page }) => {
  await signUp(page);
  await setupPlatformAdmin(page);
  const plan = await createPlan(page, "archive-plan");
  expect(plan.is_active).toBe(true);

  const archived = await adminPut(page, `/api/admin/plans/${plan.id}`, {
    id: plan.id,
    is_active: false,
  });
  expect(archived.status).toBe(200);
  const afterArchive = await adminGet(page, `/api/admin/plans/${plan.id}`);
  console.log("[verify] is_active after archive:", afterArchive.body.is_active);
  expect(afterArchive.body.is_active).toBe(false);

  await adminPut(page, `/api/admin/plans/${plan.id}`, { id: plan.id, is_active: true });
  const afterRestore = await adminGet(page, `/api/admin/plans/${plan.id}`);
  console.log("[verify] is_active after restore:", afterRestore.body.is_active);
  expect(afterRestore.body.is_active).toBe(true);
});

test("plans: feature entitlements can be set from the plan", async ({ page }) => {
  await signUp(page);
  await setupPlatformAdmin(page);
  const feature = await adminPost(page, "/api/admin/features", {
    key: `entitlement_${Date.now()}`,
    name: "Entitlement Feature",
    is_global: false,
  });
  expect(feature.status).toBe(201);

  // On create…
  const plan = await createPlan(page, "entitled-plan", { feature_ids: [feature.body.id] });
  const created = await adminGet(page, `/api/admin/plans/${plan.id}`);
  const createdFeatures = (created.body.features || []) as AnyRecord[];
  console.log("[verify] features after create:", createdFeatures.length);
  expect(createdFeatures.map((f) => f.feature_id)).toContain(feature.body.id);

  // …and on edit, where clearing the list removes them again.
  await adminPut(page, `/api/admin/plans/${plan.id}`, { id: plan.id, feature_ids: [] });
  const cleared = await adminGet(page, `/api/admin/plans/${plan.id}`);
  expect(((cleared.body.features || []) as AnyRecord[]).length).toBe(0);
});

test("tenant features: an override can go back to inherit", async ({ page }) => {
  const creds = await signUp(page);
  await setupPlatformAdmin(page);
  const tenant = await tenantByName(page, creds.company);
  const feature = await adminPost(page, "/api/admin/features", {
    key: `inherit_${Date.now()}`,
    name: "Inherit Feature",
    is_global: true,
  });

  await adminPut(page, `/api/admin/features/tenant/${tenant.id}`, {
    features: [{ feature_id: feature.body.id, enabled: false }],
  });
  const forced = await adminGet(page, `/api/admin/features/tenant/${tenant.id}`);
  expect((forced.body as unknown as AnyRecord[]).length).toBe(1);

  const back = await adminPut(page, `/api/admin/features/tenant/${tenant.id}`, {
    features: [{ feature_id: feature.body.id, enabled: null }],
  });
  console.log("[verify] inherit status:", back.status);
  expect(back.status).toBe(200);
  const inherited = await adminGet(page, `/api/admin/features/tenant/${tenant.id}`);
  console.log("[verify] overrides after inherit:", (inherited.body as unknown as AnyRecord[]).length);
  expect((inherited.body as unknown as AnyRecord[]).length).toBe(0);
});

test("tenants list: carries the active plan and supports the trial filter", async ({ page }) => {
  const creds = await signUp(page);
  await setupPlatformAdmin(page);
  const tenant = await tenantByName(page, creds.company);
  const plan = await createPlan(page, "listed-plan");

  await adminPost(page, "/api/admin/subscriptions", {
    tenant_id: tenant.id,
    plan_id: plan.id,
    billing_cycle: "monthly",
  });

  const row = await tenantByName(page, creds.company);
  console.log("[verify] plan_name on the list row:", row.plan_name);
  expect(row.plan_name).toBe(plan.name);

  // Granting a subscription clears the trial, so this tenant is "no trial" now.
  const noTrial = await adminGet(
    page,
    `/api/admin/tenants?trial=none&search=${encodeURIComponent(creds.company)}`
  );
  expect((noTrial.body as unknown as AnyRecord[]).some((r) => r.id === tenant.id)).toBe(true);
  const running = await adminGet(
    page,
    `/api/admin/tenants?trial=active&search=${encodeURIComponent(creds.company)}`
  );
  console.log("[verify] appears under trial=active:", (running.body as unknown as AnyRecord[]).length);
  expect((running.body as unknown as AnyRecord[]).some((r) => r.id === tenant.id)).toBe(false);
});

test("subscription requests: paginated and searchable by tenant", async ({ page }) => {
  const creds = await signUp(page);
  await setupPlatformAdmin(page);
  const plan = await createPlan(page, "req-plan");
  await page.evaluate(async () => {
    await fetch("/api/test/verify-email", { method: "POST", credentials: "include" });
  });
  const req = await page.evaluate(async (planId) => {
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
    return { status: r.status };
  }, String(plan.id));
  expect(req.status).toBe(201);

  const paged = await adminGet(page, "/api/admin/subscription-requests?limit=1");
  const body = paged.body as { data?: AnyRecord[]; next_cursor?: string | null };
  console.log("[verify] page size:", body.data?.length, "cursor:", !!body.next_cursor);
  expect(body.data?.length).toBe(1);

  const searched = await adminGet(
    page,
    `/api/admin/subscription-requests?limit=20&search=${encodeURIComponent(creds.company)}`
  );
  const rows = (searched.body as { data: AnyRecord[] }).data;
  console.log("[verify] search matched:", rows.length);
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.every((r) => (r.tenant as AnyRecord)?.name === creds.company)).toBe(true);
  // The target plan is still resolved alongside the paginated rows.
  expect((rows[0].target_plan as AnyRecord)?.name).toBe(plan.name);
});

test("audit logs: paging and the date filter", async ({ page }) => {
  await signUp(page);
  await setupPlatformAdmin(page);
  // Generate a few audited actions.
  for (let i = 0; i < 3; i++) await createPlan(page, `audit-plan-${i}`);

  const firstPage = await adminGet(page, "/api/admin/audit-logs?page=1&limit=2");
  const second = await adminGet(page, "/api/admin/audit-logs?page=2&limit=2");
  const a = firstPage.body as { data: AnyRecord[]; total: number };
  const b = second.body as { data: AnyRecord[] };
  console.log("[verify] page1:", a.data.length, "page2:", b.data.length, "total:", a.total);
  expect(a.data.length).toBe(2);
  expect(a.total).toBeGreaterThan(2);
  expect(a.data[0].id).not.toBe(b.data[0].id);

  // A window that ends before today must exclude everything just written.
  const past = await adminGet(page, "/api/admin/audit-logs?from=2000-01-01&to=2000-01-02");
  console.log("[verify] rows in a 2000 window:", (past.body as { data: AnyRecord[] }).data.length);
  expect((past.body as { data: AnyRecord[] }).data.length).toBe(0);
});

test("dashboard: attention counters and trial metrics are reported", async ({ page }) => {
  await signUp(page);
  await setupPlatformAdmin(page);

  const overview = await adminGet(page, "/api/admin/analytics/overview");
  const stats = overview.body as AnyRecord;
  const attention = stats.needs_attention as AnyRecord;
  console.log("[verify] attention:", JSON.stringify(attention), "trials running:", stats.trials_running);
  expect(attention).toBeTruthy();
  for (const key of [
    "pending_requests",
    "unpaid_invoices",
    "subscriptions_expiring_soon",
    "trials_ending_soon",
  ]) {
    expect(typeof attention[key]).toBe("number");
  }
  // The tenant we just signed up is on a 10-day trial.
  expect(Number(stats.trials_running)).toBeGreaterThan(0);
  expect(typeof stats.trials_converted).toBe("number");

  // GUI: the tiles render and the trial stat is on screen.
  await page.goto("/en/admin");
  await expect(page.getByText("Needs attention")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Pending requests")).toBeVisible();
  await expect(page.getByText("Trials running")).toBeVisible();
  await page.screenshot({ path: "test-results/verify-admin-dashboard.png", fullPage: false });
});

test("GUI: plan editor exposes archive and the feature checklist", async ({ page }) => {
  await signUp(page);
  await setupPlatformAdmin(page);
  // The plan first, the feature after it.
  //
  // A test plan is created carrying every feature that exists at the time — an
  // active plan with none is refused, since in production that is a paying
  // customer who receives nothing. Creating the feature first would therefore
  // have it already ticked, and the click below would untick it: the test would
  // be asserting that saving *added* what saving had just removed.
  const plan = await createPlan(page, "ui-plan");

  // Unique name: earlier runs leave same-named features in the shared test DB.
  const featureName = `UI Feature ${Date.now()}`;
  const feature = await adminPost(page, "/api/admin/features", {
    key: `ui_feature_${Date.now()}`,
    name: featureName,
    is_global: false,
  });

  await page.goto("/en/admin/plans");
  await expect(page.getByRole("heading", { name: "Plans" })).toBeVisible({ timeout: 30_000 });

  // The plan card offers Archive (not a delete), and the editor lists features.
  const card = page
    .getByRole("heading", { name: String(plan.name) })
    .locator("xpath=ancestor::div[contains(@class,\"p-6\")][1]");
  await expect(card.getByRole("button", { name: "Archive" }).first()).toBeVisible();
  await card.getByRole("button", { name: "Edit" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Included features")).toBeVisible();
  await dialog.getByRole("button", { name: String(feature.body.name) }).click();
  await dialog.getByRole("button", { name: "Update Plan" }).click();
  // The modal closes only once the write settles — assert after that, not on
  // the click, or the read races the in-flight PUT.
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await page.screenshot({ path: "test-results/verify-plan-features.png", fullPage: false });

  const saved = await adminGet(page, `/api/admin/plans/${plan.id}`);
  const savedFeatures = (saved.body.features || []) as AnyRecord[];
  console.log("[verify] features saved from the GUI:", savedFeatures.length);
  expect(savedFeatures.map((f) => f.feature_id)).toContain(feature.body.id);
});

test("GUI: a failed admin write surfaces as a toast", async ({ page }) => {
  await signUp(page);
  await setupPlatformAdmin(page);
  const plan = await createPlan(page, "dup-slug-plan");
  const feature = await adminPost(page, "/api/admin/features", {
    key: `toast_feature_${Date.now()}`,
    name: `Toast Feature ${Date.now()}`,
    is_global: false,
  });

  await page.goto("/en/admin/plans");
  await expect(page.getByRole("heading", { name: "Plans" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "New plan" }).click();
  const dialog = page.getByRole("dialog");
  // Reusing an existing slug is rejected by the database constraint.
  await dialog.locator('input[name="plan-slug"]').fill(String(plan.slug));
  await dialog.locator('input[name="plan-name"]').fill("Duplicate");
  await dialog.locator('input[name="price-monthly-0"]').fill("100");
  await dialog.locator('input[name="price-yearly-0"]').fill("1000");

  // Tick a feature, or the form is refused for being an empty offer before it
  // ever reaches the duplicate slug — and this test would be checking the wrong
  // failure. An active plan that includes nothing is a paying customer who
  // receives nothing, so the server declines it.
  await dialog.getByRole("button", { name: String(feature.body.name) }).click();
  await dialog.getByRole("button", { name: "Create Plan" }).click();

  // Queried by CSS, not by role: Radix marks everything outside an open dialog
  // aria-hidden, so the toast is in the DOM but off the accessibility tree.
  // Before this batch the failure produced nothing at all.
  await expect(page.locator("[role=alert]").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("[role=alert]").first()).toContainText(/error|Erreur/i);
  await page.screenshot({ path: "test-results/verify-admin-error-toast.png", fullPage: false });
});
