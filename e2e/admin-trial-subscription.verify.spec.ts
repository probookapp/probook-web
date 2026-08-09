import { test, expect, type Page } from "@playwright/test";
import { signUp } from "./helpers";
import { apiGet } from "./api-helpers";
import { setupPlatformAdmin, adminGet, adminPost, adminDelete } from "./admin-helpers";

/**
 * One-off verification of the two new admin controls:
 *   - ending a running free trial before its term,
 *   - granting a subscription without a tenant-submitted request.
 * Drives the real running app (API routes through the browser + the admin GUI).
 * CI runs the whole e2e/ directory, so this runs with the suite.
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
    slug: `${tag}-plan-${Date.now()}`,
    name: `${tag} Plan`,
    monthly_price: 100000,
    yearly_price: 1000000,
    currency: "DZD",
  });
  expect(res.status).toBe(201);
  return res.body as AnyRecord;
}

test("A: admin ends a running trial early — tenant drops to trial_expired, stays reachable", async ({ page }) => {
  const creds = await signUp(page);
  await setupPlatformAdmin(page);
  const tenant = await tenantByName(page, creds.company);

  // Sanity: the signup trial is running.
  const before = await apiGet(page, "/api/subscription/current");
  expect(before.body.status).toBe("trial");

  const end = await adminDelete(page, `/api/admin/tenants/${tenant.id}/trial`);
  console.log("[verify] end-trial:", end.status, JSON.stringify(end.body).slice(0, 160));
  expect(end.status).toBe(200);

  const after = await apiGet(page, "/api/subscription/current");
  console.log("[verify] current after end-trial:", JSON.stringify(after.body));
  expect(after.body.status).toBe("trial_expired");

  // Demo mode, not a lockout: authenticated routes still answer.
  const clients = await apiGet(page, "/api/clients");
  expect(clients.status).toBe(200);

  // Second call has nothing to end.
  const again = await adminDelete(page, `/api/admin/tenants/${tenant.id}/trial`);
  console.log("[verify] end-trial twice:", again.status, JSON.stringify(again.body));
  expect(again.status).toBe(400);

  // The action is audited.
  const logs = await adminGet(page, "/api/admin/audit-logs?action=tenant.end_trial");
  const rows = (logs.body.data as AnyRecord[]) || [];
  expect(rows.some((r) => r.target_id === tenant.id)).toBe(true);
});

test("B: admin grants a subscription with no tenant request — active plan, invoice, trial cleared", async ({ page }) => {
  const creds = await signUp(page);
  await setupPlatformAdmin(page);
  const tenant = await tenantByName(page, creds.company);
  const plan = await createPlan(page, "grant");

  // No subscription request was ever submitted by this tenant.
  const created = await adminPost(page, "/api/admin/subscriptions", {
    tenant_id: tenant.id,
    plan_id: plan.id,
    billing_cycle: "monthly",
  });
  console.log("[verify] create subscription:", created.status, JSON.stringify(created.body).slice(0, 200));
  expect(created.status).toBe(201);
  expect(created.body.status).toBe("active");
  expect(created.body.price_at_purchase).toBe(100000);

  const cur = await apiGet(page, "/api/subscription/current");
  console.log("[verify] tenant current after grant:", cur.body.status);
  expect(cur.body.status).toBe("active");

  // The signup trial is cleared so it can't hijack later wall messaging.
  const row = await adminGet(page, `/api/admin/tenants/${tenant.id}`);
  expect(row.body.trial_ends_at).toBeNull();

  // An unpaid invoice was raised for the period.
  const invoices = await adminGet(page, "/api/admin/subscription-invoices");
  const mine = (invoices.body as unknown as AnyRecord[]).filter((i) => i.tenant_id === tenant.id);
  console.log("[verify] invoices for tenant:", mine.length, mine[0] && mine[0].status);
  expect(mine.length).toBe(1);
  expect(mine[0].status).toBe("unpaid");
  expect(mine[0].amount).toBe(100000);

  // A second grant supersedes the first instead of leaving two active rows.
  const plan2 = await createPlan(page, "grant2");
  const second = await adminPost(page, "/api/admin/subscriptions", {
    tenant_id: tenant.id,
    plan_id: plan2.id,
    billing_cycle: "yearly",
    price: 0,
    create_invoice: false,
  });
  expect(second.status).toBe(201);
  const first = await adminGet(page, `/api/admin/subscriptions/${created.body.id}`);
  console.log("[verify] first subscription after second grant:", first.body.status);
  expect(first.body.status).toBe("cancelled");

  // Comped (price 0) and invoice-free, as asked.
  expect(second.body.price_at_purchase).toBe(0);
  const invoices2 = await adminGet(page, "/api/admin/subscription-invoices");
  expect((invoices2.body as unknown as AnyRecord[]).filter((i) => i.tenant_id === tenant.id).length).toBe(1);
});

test("C: GUI — 'End trial now' on the tenant page flips the trial badge", async ({ page }) => {
  const creds = await signUp(page);
  await setupPlatformAdmin(page);
  const tenant = await tenantByName(page, creds.company);

  await page.goto(`/en/admin/tenants/${tenant.id}`);
  await expect(page.getByText(/trial active until/i)).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "End trial now" }).click();
  await expect(page.getByText(/the trial ends immediately/i)).toBeVisible();
  // The confirm button inside the dialog, not the header trigger.
  await page.getByRole("dialog").getByRole("button", { name: "End trial now" }).click();

  await expect(page.getByText(/trial ended on/i)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "End trial now" })).toHaveCount(0);
  await page.screenshot({ path: "test-results/verify-end-trial.png", fullPage: false });

  const cur = await apiGet(page, "/api/subscription/current");
  expect(cur.body.status).toBe("trial_expired");
});

test("D: GUI — granting a subscription from the subscriptions page", async ({ page }) => {
  const creds = await signUp(page);
  await setupPlatformAdmin(page);
  const tenant = await tenantByName(page, creds.company);
  const plan = await createPlan(page, "ui-grant");

  await page.goto("/en/admin/subscriptions");
  await expect(page.getByRole("heading", { name: "Subscriptions" })).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "New subscription" }).click();
  const dialog = page.getByRole("dialog");

  // Tenant picker is a searchable combobox.
  await dialog.getByText("Select a tenant").click();
  await dialog.locator('input[placeholder="..."]').fill(creds.company);
  await dialog.getByRole("option", { name: creds.company }).click();

  // By id, not label: earlier runs leave same-named plans in the test DB.
  await dialog.locator('select[name="create-plan"]').selectOption(String(plan.id));
  await dialog.locator('select[name="create-cycle"]').selectOption("monthly");

  await page.screenshot({ path: "test-results/verify-grant-form.png", fullPage: false });
  await dialog.getByRole("button", { name: "Grant subscription" }).click();

  // The new row lands in the list, with a real plan name / price / period
  // (these columns used to print "[object Object]" and "-").
  await expect(page.getByText(creds.company).first()).toBeAttached({ timeout: 20_000 });
  await expect(page.getByText(String(plan.name)).first()).toBeAttached({ timeout: 20_000 });
  await expect(page.getByText(/1[.,\s]?000 DZD/).first()).toBeAttached();
  await expect(page.getByText("[object Object]")).toHaveCount(0);
  await page.screenshot({ path: "test-results/verify-grant-subscription.png", fullPage: false });

  // …and the tenant really has an active subscription on that plan.
  const cur = await apiGet(page, "/api/subscription/current");
  console.log("[verify] current after GUI grant:", cur.body.status, JSON.stringify(cur.body.plan || {}).slice(0, 120));
  expect(cur.body.status).toBe("active");
  expect((cur.body.plan as AnyRecord).id).toBe(plan.id);

  const detail = await adminGet(page, `/api/admin/tenants/${tenant.id}`);
  expect(detail.body.trial_ends_at).toBeNull();

  // The tenant page's Subscription tab shows it too (it read a `subscription`
  // field the route never returned, so it always said "no subscription").
  await page.goto(`/en/admin/tenants/${tenant.id}`);
  await page.getByRole("button", { name: "Subscription" }).click();
  await expect(page.getByText(String(plan.name)).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/1[.,\s]?000 DZD/)).toBeVisible();
  await page.screenshot({ path: "test-results/verify-tenant-subscription-tab.png", fullPage: false });
});
