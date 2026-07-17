import { type Page, expect } from "@playwright/test";
import { signUp } from "./helpers";
import { apiPost } from "./api-helpers";
import { setupPlatformAdmin, adminPost } from "./admin-helpers";

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

  // Create an active plan to subscribe to.
  const plan = await adminPost(page, "/api/admin/plans", {
    slug: `sub-plan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: "E2E Subscription Plan",
    monthly_price: 100000,
    yearly_price: 1000000,
    currency: "DZD",
  });
  expect(plan.status).toBe(201);
  const planId = plan.body.id as string;

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

  // The app persists its React-Query cache to IndexedDB (idb-keyval:
  // db "keyval-store", store "keyval", key "probook-query-cache") with a 60s
  // staleTime. During signUp it cached `current-subscription: null`, so the
  // layout would keep computing isDemoMode=true from that stale value on the
  // next navigation. Drop the persisted key so the next page load refetches the
  // now-active subscription and leaves demo mode.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const open = indexedDB.open("keyval-store");
        open.onsuccess = () => {
          const db = open.result;
          try {
            const tx = db.transaction("keyval", "readwrite");
            tx.objectStore("keyval").delete("probook-query-cache");
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => {
              db.close();
              resolve();
            };
          } catch {
            resolve();
          }
        };
        open.onerror = () => resolve();
      })
  );
}
