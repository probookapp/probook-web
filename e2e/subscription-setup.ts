import { type Page, expect } from "@playwright/test";
import { signUp } from "./helpers";
import { apiPost } from "./api-helpers";
import { setupPlatformAdmin, adminPost, adminGet } from "./admin-helpers";
import { clearPersistedQueryCache } from "./query-cache";

/**
 * Sign up a fresh tenant AND give it an active subscription so the app is no
 * longer in "demo mode" (which replaces real data with sample/demo data and
 * gates writes behind the subscribe prompt).
 *
 * Drives the real flow: tenant signs up → a platform admin is created →
 * an active plan is created → the tenant submits a "new" subscription request →
 * the admin approves it, which creates an ACTIVE Subscription for the tenant.
 *
 * The tenant session cookie and the platform-admin session cookie use different
 * names, so both coexist: after this returns, the browser is still logged in as
 * the tenant (its session drives all app pages) and has an active subscription.
 */
export async function signUpSubscribed(page: Page) {
  await stubServiceWorker(page);
  const creds = await signUp(page);
  await seedSubscription(page);
  return creds;
}

/**
 * Prevent the app's service worker from registering.
 *
 * ServiceWorkerRegistration.tsx registers /sw.js, which calls clients.claim() on
 * activate; that fires `controllerchange`, whose handler runs
 * window.location.reload(). That reload lands mid-signUp and destroys the
 * in-flight navigation / page.evaluate, causing spurious flakes
 * ("Failed to fetch", "Execution context was destroyed", waitForURL timeouts).
 *
 * Must be called BEFORE the first navigation. Stubbing registration is
 * deterministic — do not wait on navigator.serviceWorker.controller, that's racy.
 */
export async function stubServiceWorker(page: Page) {
  await page.addInitScript(() => {
    if ("serviceWorker" in navigator) {
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: {
          // Never resolves → the .then() chain that wires up updatefound /
          // controllerchange never runs, so nothing reloads the page.
          register: () => new Promise(() => {}),
          ready: new Promise(() => {}),
          controller: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          getRegistrations: () => Promise.resolve([]),
        },
      });
    }
  });
}

/** Seed an ACTIVE subscription for the already-signed-up tenant on `page`. */
export async function seedSubscription(page: Page) {
  // Platform admin session (separate cookie — tenant session still valid).
  await setupPlatformAdmin(page);

  // Create an active plan to subscribe to — carrying every entitlement.
  //
  // It used to carry none, which made the tenant a paying customer on an offer
  // that included nothing: once the gate went in, eleven suites failed because
  // their tenant had genuinely bought a plan with no modules in it. The API now
  // refuses to create such a plan at all; what the suites want is a customer on
  // the full offer, so say so.
  const features = await adminGet(page, "/api/admin/features");
  const featureIds = (features.body as unknown as { id: string }[]).map((f) => f.id);

  const plan = await adminPost(page, "/api/admin/plans", {
    slug: `sub-plan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: "E2E Subscription Plan",
    monthly_price: 100000,
    yearly_price: 1000000,
    currency: "DZD",
    feature_ids: featureIds,
  });
  expect(plan.status, JSON.stringify(plan.body)).toBe(201);
  const planId = plan.body.id as string;

  // Submitting a subscription request now requires a verified email — mark the
  // tenant's email verified via the test-only endpoint so the real flow passes.
  const verified = await apiPost(page, "/api/test/verify-email");
  expect(verified.status).toBe(200);

  // Tenant submits a "new" subscription request (uses the tenant session).
  const reqRes = await apiPost(page, "/api/subscription/request", {
    plan_id: planId,
    billing_cycle: "monthly",
    request_type: "new",
    currency: "DZD",
  });
  expect(reqRes.status).toBe(201);
  const requestId = reqRes.body.id as string;

  // Admin approves → creates the active subscription + first invoice.
  const approve = await adminPost(
    page,
    `/api/admin/subscription-requests/${requestId}/approve`
  );
  expect(approve.status).toBe(200);

  // signUp cached `current-subscription: null`, so the layout would keep
  // computing isDemoMode=true from that stale value on the next navigation.
  await clearPersistedQueryCache(page);
}
