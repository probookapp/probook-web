import { test, expect, type Page } from "@playwright/test";
import { signUp } from "./helpers";
import { apiPost } from "./api-helpers";
import { setupPlatformAdmin, adminGet, adminPost, adminPut, adminDelete } from "./admin-helpers";

/**
 * Navigate to the login page with the PWA service worker disabled.
 *
 * The app registers a service worker that calls `clients.claim()` on activate
 * and then reloads the page via a `controllerchange` handler. That reload fires
 * asynchronously after first load and would destroy an in-flight `page.evaluate`
 * (as used by setupPlatformAdmin) — surfacing as a spurious "Failed to fetch" /
 * "Execution context was destroyed". These admin specs don't exercise offline
 * behavior, so we stub out SW registration to keep setup deterministic.
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

/**
 * Billing admin capabilities:
 *  - plan delete (soft delete → isActive false)
 *  - subscription EDIT (plan / cycle / status / period)
 *  - subscription-invoice CREATE + EDIT + REFUND
 *  - coupon DELETE (soft)
 *  - feature-flag DELETE (hard)
 *
 * These are destructive / stateful actions, so they are asserted at the API
 * level (per the harness guidance) rather than click-driven.
 */

type AnyRecord = Record<string, unknown>;

/**
 * Seed an ACTIVE subscription for a fresh tenant by driving the real flow:
 * tenant submits a subscription request, platform admin approves it (which
 * creates the Subscription + its first SubscriptionInvoice).
 * Returns the subscription id and the owning tenant id.
 */
async function seedSubscription(page: import("@playwright/test").Page) {
  // 1. Fresh tenant (browser ends logged in as the tenant admin).
  await signUp(page);

  // 2. Platform admin session (separate cookie — tenant session still valid).
  await setupPlatformAdmin(page);

  // 3. Create an active plan to subscribe to.
  const plan = await adminPost(page, "/api/admin/plans", {
    slug: `bill-plan-${Date.now()}`,
    name: "Billing Test Plan",
    monthly_price: 100000,
    yearly_price: 1000000,
    currency: "DZD",
  });
  expect(plan.status).toBe(201);
  const planId = plan.body.id as string;

  // Subscription requests require a verified email — clear that gate first.
  const verified = await apiPost(page, "/api/test/verify-email");
  expect(verified.status).toBe(200);

  // 4. Tenant submits a "new" subscription request (uses the tenant session).
  const reqRes = await apiPost(page, "/api/subscription/request", {
    plan_id: planId,
    billing_cycle: "monthly",
    request_type: "new",
    currency: "DZD",
  });
  expect(reqRes.status).toBe(201);
  const requestId = reqRes.body.id as string;

  // 5. Admin approves → creates the subscription + first invoice.
  const approve = await adminPost(
    page,
    `/api/admin/subscription-requests/${requestId}/approve`
  );
  expect(approve.status).toBe(200);
  const subscription = approve.body.subscription as AnyRecord;
  expect(subscription).toBeTruthy();

  return { subscriptionId: String(subscription.id), planId };
}

test.describe("Admin billing: plans", () => {
  test.beforeEach(async ({ page }) => {
    await gotoLoginStable(page);
  });

  test("delete plan soft-deactivates it", async ({ page }) => {
    await setupPlatformAdmin(page);

    const plan = await adminPost(page, "/api/admin/plans", {
      slug: `del-plan-${Date.now()}`,
      name: "Deletable Plan",
      monthly_price: 500,
      yearly_price: 5000,
    });
    expect(plan.status).toBe(201);
    const id = plan.body.id as string;

    const del = await adminDelete(page, `/api/admin/plans/${id}`);
    expect(del.status).toBe(204);

    // Soft delete: row still exists but is inactive.
    const after = await adminGet(page, `/api/admin/plans/${id}`);
    expect(after.status).toBe(200);
    expect(after.body.is_active).toBe(false);
  });
});

test.describe("Admin billing: subscriptions", () => {
  test.beforeEach(async ({ page }) => {
    await gotoLoginStable(page);
  });

  test("edit a subscription (cycle + status + period)", async ({ page }) => {
    const { subscriptionId } = await seedSubscription(page);

    const newPeriodEnd = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString();
    const updated = await adminPut(page, `/api/admin/subscriptions/${subscriptionId}`, {
      billing_cycle: "yearly",
      status: "suspended",
      current_period_end: newPeriodEnd,
    });
    expect(updated.status).toBe(200);
    expect(updated.body.billing_cycle).toBe("yearly");
    expect(updated.body.status).toBe("suspended");
  });

  test("edit subscription rejects an invalid status", async ({ page }) => {
    const { subscriptionId } = await seedSubscription(page);

    const bad = await adminPut(page, `/api/admin/subscriptions/${subscriptionId}`, {
      status: "not-a-real-status",
    });
    expect(bad.status).toBe(400);
  });
});

test.describe("Admin billing: subscription invoices", () => {
  test.beforeEach(async ({ page }) => {
    await gotoLoginStable(page);
  });

  test("create, edit, then refund a subscription invoice", async ({ page }) => {
    const { subscriptionId } = await seedSubscription(page);

    // CREATE
    const created = await adminPost(page, "/api/admin/subscription-invoices", {
      subscription_id: subscriptionId,
      amount: 250000,
      currency: "DZD",
      status: "unpaid",
    });
    expect(created.status).toBe(201);
    expect(created.body.amount).toBe(250000);
    expect(created.body.status).toBe("unpaid");
    const invoiceId = created.body.id as string;

    // EDIT (change amount + mark paid)
    const edited = await adminPut(page, `/api/admin/subscription-invoices/${invoiceId}`, {
      amount: 300000,
      status: "paid",
    });
    expect(edited.status).toBe(200);
    expect(edited.body.amount).toBe(300000);
    expect(edited.body.status).toBe("paid");
    expect(edited.body.paid_at).toBeTruthy();

    // REFUND (status → refunded, paidAt cleared)
    const refunded = await adminPut(page, `/api/admin/subscription-invoices/${invoiceId}`, {
      status: "refunded",
    });
    expect(refunded.status).toBe(200);
    expect(refunded.body.status).toBe("refunded");
    expect(refunded.body.paid_at).toBeNull();
  });

  test("invoice rejects an invalid status", async ({ page }) => {
    const { subscriptionId } = await seedSubscription(page);

    const created = await adminPost(page, "/api/admin/subscription-invoices", {
      subscription_id: subscriptionId,
      amount: 1000,
    });
    expect(created.status).toBe(201);

    const bad = await adminPut(
      page,
      `/api/admin/subscription-invoices/${created.body.id}`,
      { status: "bogus" }
    );
    expect(bad.status).toBe(400);
  });
});

test.describe("Admin billing: coupon & feature deletion", () => {
  test.beforeEach(async ({ page }) => {
    await gotoLoginStable(page);
  });

  test("delete coupon soft-deactivates it", async ({ page }) => {
    await setupPlatformAdmin(page);

    const coupon = await adminPost(page, "/api/admin/coupons", {
      code: `DELCOUP${Date.now()}`,
      discount_type: "percentage",
      discount_value: 15,
      is_active: true,
    });
    expect(coupon.status).toBe(201);
    const id = coupon.body.id as string;

    const del = await adminDelete(page, `/api/admin/coupons/${id}`);
    expect(del.status).toBe(204);

    const after = await adminGet(page, `/api/admin/coupons/${id}`);
    expect(after.status).toBe(200);
    expect(after.body.is_active).toBe(false);
  });

  test("delete a feature flag removes it entirely", async ({ page }) => {
    await setupPlatformAdmin(page);

    const key = `del_feature_${Date.now()}`;
    const feature = await adminPost(page, "/api/admin/features", {
      key,
      name: "Deletable Feature",
      is_global: true,
    });
    expect(feature.status).toBe(201);
    const id = feature.body.id as string;

    const del = await adminDelete(page, `/api/admin/features/${id}`);
    expect(del.status).toBe(204);

    // Hard delete: fetching it now 404s, and it's gone from the list.
    const single = await adminGet(page, `/api/admin/features/${id}`);
    expect(single.status).toBe(404);

    const list = await adminGet(page, "/api/admin/features");
    const stillThere = (list.body as unknown as AnyRecord[]).some((f) => f.id === id);
    expect(stillThere).toBe(false);
  });
});
