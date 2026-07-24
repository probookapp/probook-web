import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { signUp } from "./helpers";
import { apiGet, apiPost } from "./api-helpers";
import { setupPlatformAdmin, adminGet, adminPost } from "./admin-helpers";

/**
 * One-off end-to-end verification of the trial + email-verification onboarding
 * change. Drives the real running app (GUI + real API routes through the
 * browser). NOT part of the CI suite — a manual pre-commit check.
 */

// Safety: only ever touch the local test DB.
const DB_URL = process.env.DATABASE_URL || "";
if (!DB_URL.includes("probook_test")) {
  throw new Error(`Refusing to run: DATABASE_URL is not the test DB (${DB_URL.slice(0, 40)}...)`);
}
const pool = new Pool({ connectionString: DB_URL });

test.afterAll(async () => {
  await pool.end();
});

function slugOf(company: string) {
  return company.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Drop the persisted React-Query cache so the next load refetches subscription. */
async function clearQueryCache(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const open = indexedDB.open("keyval-store");
        open.onsuccess = () => {
          const db = open.result;
          try {
            const tx = db.transaction("keyval", "readwrite");
            const store = tx.objectStore("keyval");
            const req = store.getAllKeys();
            req.onsuccess = () => {
              for (const key of req.result) {
                if (String(key).startsWith("probook-query-cache")) store.delete(key);
              }
            };
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => { db.close(); resolve(); };
          } catch { resolve(); }
        };
        open.onerror = () => resolve();
      })
  );
}


test("1+2: signup requires email, starts a 10-day trial with real (non-demo) access", async ({ page }) => {
  const creds = await signUp(page);

  // API: current subscription reports an active trial ~10 days out.
  const cur = await apiGet(page, "/api/subscription/current");
  expect(cur.status).toBe(200);
  expect(cur.body.status).toBe("trial");
  expect(cur.body.is_trial).toBe(true);
  const days = Math.round((new Date(String(cur.body.trial_ends_at)).getTime() - Date.now()) / 86400000);
  console.log("[verify] trial days out:", days, "trial_ends_at:", cur.body.trial_ends_at);
  expect(days).toBeGreaterThanOrEqual(9);
  expect(days).toBeLessThanOrEqual(10);

  // GUI: trial banner visible, demo banner NOT present.
  await page.goto("/en/dashboard");
  await expect(page.getByText(/free trial/i).first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/exploring a demo/i)).toHaveCount(0);
  await page.screenshot({ path: "test-results/verify-trial-banner.png", fullPage: false });

  // Real access: create a client, then confirm the GUI shows *that real* client
  // (in demo mode the list would show hard-coded demo data instead).
  const c = await apiPost(page, "/api/clients", { name: "Trial Real Client" });
  expect([200, 201]).toContain(c.status);
  expect(c.body.id).toBeTruthy();
  await page.goto("/en/clients");
  // Presence in the list proves the GUI is reading REAL tenant data (the demo
  // list is hard-coded and would never contain this name). The app renders
  // responsive desktop+mobile variants, so assert DOM attachment, not a single
  // visible node.
  await expect(page.getByText("Trial Real Client").first()).toBeAttached({ timeout: 20000 });
  await page.screenshot({ path: "test-results/verify-trial-clients.png", fullPage: false });
  console.log("[verify] created+listed real client for tenant", creds.username);
});

test("3: subscription request is blocked until email is verified", async ({ page }) => {
  await signUp(page);
  await setupPlatformAdmin(page);
  const plan = await adminPost(page, "/api/admin/plans", {
    slug: `verify-plan-${Date.now()}`,
    name: "Verify Plan",
    monthly_price: 100000,
    yearly_price: 1000000,
    currency: "DZD",
  });
  expect(plan.status).toBe(201);
  const planId = plan.body.id as string;

  // Unverified email → gate refuses with EMAIL_NOT_VERIFIED.
  const blocked = await apiPost(page, "/api/subscription/request", {
    plan_id: planId, billing_cycle: "monthly", request_type: "new", currency: "DZD",
  });
  console.log("[verify] request while unverified:", blocked.status, JSON.stringify(blocked.body));
  expect(blocked.status).toBe(403);
  expect(blocked.body.code).toBe("EMAIL_NOT_VERIFIED");

  // Self-service set/verify-email endpoint runs (email delivery depends on env).
  const setEmail = await apiPost(page, "/api/auth/email", { email: "verify-me@example.com" });
  console.log("[verify] /api/auth/email status:", setEmail.status, JSON.stringify(setEmail.body));

  // After the email is verified, the same request now succeeds.
  const verified = await apiPost(page, "/api/test/verify-email");
  expect(verified.status).toBe(200);
  const ok = await apiPost(page, "/api/subscription/request", {
    plan_id: planId, billing_cycle: "monthly", request_type: "new", currency: "DZD",
  });
  console.log("[verify] request after verify:", ok.status);
  expect(ok.status).toBe(201);
});

test("4: admin grant-trial converts an active subscription into a trial", async ({ page }) => {
  await signUp(page);
  await setupPlatformAdmin(page);
  const plan = await adminPost(page, "/api/admin/plans", {
    slug: `grant-plan-${Date.now()}`,
    name: "Grant Plan",
    monthly_price: 100000,
    yearly_price: 1000000,
    currency: "DZD",
  });
  const planId = plan.body.id as string;
  await apiPost(page, "/api/test/verify-email");
  const reqRes = await apiPost(page, "/api/subscription/request", {
    plan_id: planId, billing_cycle: "monthly", request_type: "new", currency: "DZD",
  });
  const requestId = reqRes.body.id as string;
  const approve = await adminPost(page, `/api/admin/subscription-requests/${requestId}/approve`);
  expect(approve.status).toBe(200);
  const sub = approve.body.subscription as Record<string, unknown>;
  const tenantId = String(sub.tenant_id);
  const subId = String(sub.id);

  // Sanity: tenant currently reads as an ACTIVE paid subscription.
  const before = await apiGet(page, "/api/subscription/current");
  expect(before.body.status).toBe("active");

  // Admin grants a 5-day trial → cancels the active sub, opens a trial window.
  const grant = await adminPost(page, `/api/admin/tenants/${tenantId}/trial`, { days: 5 });
  console.log("[verify] grant-trial status:", grant.status, JSON.stringify(grant.body).slice(0, 200));
  expect(grant.status).toBe(200);

  const after = await apiGet(page, "/api/subscription/current");
  console.log("[verify] tenant current after grant:", after.body.status, after.body.is_trial);
  expect(after.body.status).toBe("trial");
  expect(after.body.is_trial).toBe(true);
  const days = Math.round((new Date(String(after.body.trial_ends_at)).getTime() - Date.now()) / 86400000);
  expect(days).toBeGreaterThanOrEqual(4);
  expect(days).toBeLessThanOrEqual(5);

  // The previously active subscription is now cancelled.
  const subRow = await adminGet(page, `/api/admin/subscriptions/${subId}`);
  console.log("[verify] old subscription status:", subRow.body.status);
  expect(subRow.body.status).toBe("cancelled");
});

test("5: an expired trial reverts to demo mode + a 'trial ended' wall", async ({ page }) => {
  const creds = await signUp(page);

  // Expire the trial directly in the test DB.
  const res = await pool.query(
    `UPDATE tenants SET trial_ends_at = NOW() - INTERVAL '1 day'
     WHERE slug LIKE $1 RETURNING id, slug`,
    [slugOf(creds.company) + "%"]
  );
  console.log("[verify] expired trial for", res.rows.map((r) => r.slug));
  expect(res.rowCount).toBeGreaterThan(0);

  // API now reports trial_expired.
  const cur = await apiGet(page, "/api/subscription/current");
  console.log("[verify] current after expiry:", JSON.stringify(cur.body));
  expect(cur.body.status).toBe("trial_expired");

  // GUI: demo banner returns; opening plans shows the trial-ended message.
  await clearQueryCache(page);
  await page.goto("/en/dashboard");
  await expect(page.getByText(/exploring a demo/i).first()).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: /view plans/i }).first().click();
  await expect(page.getByText(/your free trial has ended/i)).toBeVisible({ timeout: 20000 });
  await page.screenshot({ path: "test-results/verify-trial-ended-wall.png", fullPage: false });
});
