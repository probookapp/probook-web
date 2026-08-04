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

/**
 * GET a cron route with the scheduler's bearer token. Cron routes skip auth
 * outside production, but CI drives a production build, where they require it.
 */
function cronGet(page: Page, path: string) {
  const secret = process.env.CRON_SECRET;
  return page.evaluate(
    async ([p, s]) => {
      const r = await fetch(p, {
        credentials: "include",
        headers: s ? { authorization: `Bearer ${s}` } : {},
      });
      const json = await r.json().catch(() => ({}));
      return { status: r.status, body: json };
    },
    [path, secret ?? null] as [string, string | null]
  );
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

test("6: a pending request is surfaced during trial; resubmit returns PENDING_REQUEST_EXISTS", async ({ page }) => {
  await signUp(page);
  await setupPlatformAdmin(page);
  const plan = await adminPost(page, "/api/admin/plans", {
    slug: `p6-plan-${Date.now()}`, name: "P6 Plan",
    monthly_price: 100000, yearly_price: 1000000, currency: "DZD",
  });
  const planId = plan.body.id as string;
  await apiPost(page, "/api/test/verify-email");
  const req = await apiPost(page, "/api/subscription/request", {
    plan_id: planId, billing_cycle: "monthly", request_type: "new", currency: "DZD",
  });
  expect(req.status).toBe(201);

  // Still inside the trial, but the pending request is now surfaced.
  const cur = await apiGet(page, "/api/subscription/current");
  console.log("[verify] current during trial w/ pending:", JSON.stringify(cur.body).slice(0, 160));
  expect(cur.body.status).toBe("trial");
  expect(cur.body.pending_request).toBe(true);

  // Resubmitting returns a machine-readable 409 the client can recognise.
  const dup = await apiPost(page, "/api/subscription/request", {
    plan_id: planId, billing_cycle: "monthly", request_type: "new", currency: "DZD",
  });
  console.log("[verify] duplicate request:", dup.status, JSON.stringify(dup.body));
  expect(dup.status).toBe(409);
  expect(dup.body.code).toBe("PENDING_REQUEST_EXISTS");
});

test("7: a rejected request is surfaced with its reason after the trial lapses", async ({ page }) => {
  const creds = await signUp(page);
  await setupPlatformAdmin(page);
  const plan = await adminPost(page, "/api/admin/plans", {
    slug: `p7-plan-${Date.now()}`, name: "P7 Plan",
    monthly_price: 100000, yearly_price: 1000000, currency: "DZD",
  });
  const planId = plan.body.id as string;
  await apiPost(page, "/api/test/verify-email");
  const req = await apiPost(page, "/api/subscription/request", {
    plan_id: planId, billing_cycle: "monthly", request_type: "new", currency: "DZD",
  });
  const reqId = req.body.id as string;
  const rej = await adminPost(page, `/api/admin/subscription-requests/${reqId}/reject`, {
    admin_notes: "Need more info",
  });
  expect(rej.status).toBe(200);

  await pool.query(
    `UPDATE tenants SET trial_ends_at = NOW() - INTERVAL '1 day' WHERE slug LIKE $1`,
    [slugOf(creds.company) + "%"]
  );
  const cur = await apiGet(page, "/api/subscription/current");
  console.log("[verify] current after reject+expiry:", JSON.stringify(cur.body).slice(0, 200));
  expect(cur.body.status).toBe("trial_expired");
  expect(cur.body.rejected_request).toBe(true);
  expect(cur.body.rejection_reason).toBe("Need more info");
});

test("8: unverified users see a verify-email banner; /me exposes verification state", async ({ page }) => {
  await signUp(page);

  // Signup response and /me both expose verification state now.
  const me1 = await apiGet(page, "/api/auth/me");
  console.log("[verify] /me email/email_verified:", me1.body.email, me1.body.email_verified);
  expect(me1.body.email).toBeTruthy();
  expect(me1.body.email_verified).toBe(false);

  // The dashboard shows the in-app "verify your email" nudge.
  await page.goto("/en/dashboard");
  await expect(page.getByText(/verify your email/i).first()).toBeVisible({ timeout: 20000 });

  // After verification /me flips to true.
  await apiPost(page, "/api/test/verify-email");
  const me2 = await apiGet(page, "/api/auth/me");
  expect(me2.body.email_verified).toBe(true);
});

// Helper: fresh tenant + active subscription, returns ids.
async function seedActive(page: Page, tag: string) {
  await signUp(page);
  await setupPlatformAdmin(page);
  const plan = await adminPost(page, "/api/admin/plans", {
    slug: `${tag}-plan-${Date.now()}`, name: `${tag} Plan`,
    monthly_price: 100000, yearly_price: 1000000, currency: "DZD",
  });
  const planId = plan.body.id as string;
  await apiPost(page, "/api/test/verify-email");
  const req = await apiPost(page, "/api/subscription/request", {
    plan_id: planId, billing_cycle: "monthly", request_type: "new", currency: "DZD",
  });
  const approve = await adminPost(page, `/api/admin/subscription-requests/${req.body.id}/approve`);
  const sub = approve.body.subscription as Record<string, unknown>;
  return { subId: String(sub.id), tenantId: String(sub.tenant_id) };
}

test("9: cancelling a subscription drops the tenant to demo, not a lockout", async ({ page }) => {
  const { subId } = await seedActive(page, "c9");
  const cancel = await adminPost(page, `/api/admin/subscriptions/${subId}/cancel`);
  expect(cancel.status).toBe(200);

  // A withAuth route still works (403 would mean the tenant was suspended).
  const clients = await apiGet(page, "/api/clients");
  console.log("[verify] GET /api/clients after cancel:", clients.status);
  expect(clients.status).toBe(200);

  const cur = await apiGet(page, "/api/subscription/current");
  console.log("[verify] current after cancel:", cur.body.status);
  expect(cur.body.status).toBe("cancelled");
});

test("10: renewing a cancelled subscription restores active access", async ({ page }) => {
  const { subId } = await seedActive(page, "c10");
  await adminPost(page, `/api/admin/subscriptions/${subId}/cancel`);
  const renew = await adminPost(page, `/api/admin/subscriptions/${subId}/renew`);
  expect(renew.status).toBe(200);
  const cur = await apiGet(page, "/api/subscription/current");
  console.log("[verify] current after renew:", cur.body.status);
  expect(cur.body.status).toBe("active");
});

test("11: the expiry cron flips a past-period active subscription to expired", async ({ page }) => {
  const { subId } = await seedActive(page, "c11");
  await pool.query(
    `UPDATE subscriptions SET current_period_end = NOW() - INTERVAL '1 day' WHERE id = $1`,
    [subId]
  );
  // The client treats it as expired immediately, without waiting for the cron.
  const before = await apiGet(page, "/api/subscription/current");
  expect(before.body.status).toBe("expired");
  // The cron makes the DB row consistent. Against a production build (CI) the
  // route demands the Vercel cron bearer, so send it when configured.
  const cron = await cronGet(page, "/api/cron/subscriptions");
  console.log("[verify] cron result:", JSON.stringify(cron.body));
  expect(cron.status).toBe(200);
  const row = await adminGet(page, `/api/admin/subscriptions/${subId}`);
  expect(row.body.status).toBe("expired");
});

test("12: a verified email cannot be reused by another signup", async ({ page }) => {
  const creds = await signUp(page);
  await apiPost(page, "/api/test/verify-email"); // verify this account's email

  const dup = await apiPost(page, "/api/auth/signup", {
    company_name: "Dup Co",
    username: `dupuser_${Date.now().toString(36)}`,
    display_name: "Dup User",
    password: "Password123!",
    email: creds.email,
  });
  console.log("[verify] duplicate-email signup:", dup.status, JSON.stringify(dup.body));
  expect(dup.status).toBe(409);
  expect(dup.body.code).toBe("EMAIL_TAKEN");
});

test("13: issuing a new verification token invalidates the prior unused one", async ({ page }) => {
  const creds = await signUp(page);
  const u = await pool.query(
    `SELECT u.id FROM users u JOIN tenants t ON t.id = u.tenant_id
     WHERE t.slug LIKE $1 ORDER BY u.created_at DESC LIMIT 1`,
    [slugOf(creds.company) + "%"]
  );
  const userId = u.rows[0].id as string;
  const old = await pool.query(
    `SELECT token FROM email_verification_tokens WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  const oldToken = old.rows[0].token as string;
  // Age the signup token well past the 2-minute resend throttle (fixed far-past
  // date avoids tz-naive NOW() skew between raw SQL and Prisma reads).
  await pool.query(
    `UPDATE email_verification_tokens SET created_at = TIMESTAMP '2000-01-01 00:00:00' WHERE user_id = $1`,
    [userId]
  );

  // Resend issues a new token (email send may 502 in this env — irrelevant; the
  // token is issued before the send, and old unused tokens are deleted).
  const rr = await apiPost(page, "/api/auth/resend-verification");
  console.log("[verify] resend status:", rr.status, JSON.stringify(rr.body));
  const all = await pool.query(
    `SELECT token, used_at, created_at FROM email_verification_tokens WHERE user_id = $1 ORDER BY created_at`,
    [userId]
  );
  console.log("[verify] tokens for user now:", all.rows.length, all.rows.map((r) => ({ t: String(r.token).slice(0, 8), used: !!r.used_at })));

  const gone = await pool.query(
    `SELECT count(*)::int AS n FROM email_verification_tokens WHERE token = $1`,
    [oldToken]
  );
  console.log("[verify] old token rows after reissue:", gone.rows[0].n);
  expect(gone.rows[0].n).toBe(0);
});

test("14: opening the same verification link twice succeeds both times", async ({ page }) => {
  const creds = await signUp(page);
  const u = await pool.query(
    `SELECT u.id FROM users u JOIN tenants t ON t.id = u.tenant_id
     WHERE t.slug LIKE $1 ORDER BY u.created_at DESC LIMIT 1`,
    [slugOf(creds.company) + "%"]
  );
  const userId = u.rows[0].id as string;
  const tok = await pool.query(
    `SELECT token FROM email_verification_tokens WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  const token = tok.rows[0].token as string;

  // A single click can reach the route twice (in-app webview then the real
  // browser, a remount). The replay must report success, not "already used" —
  // that regression made a working verification look broken.
  const first = await apiPost(page, "/api/auth/verify-email", { token });
  const second = await apiPost(page, "/api/auth/verify-email", { token });
  console.log("[verify] verify twice:", first.status, JSON.stringify(first.body), "|", second.status, JSON.stringify(second.body));
  expect(first.status).toBe(200);
  expect(second.status).toBe(200);
  expect(second.body.already_verified).toBe(true);

  const after = await pool.query(`SELECT email_verified FROM users WHERE id = $1`, [userId]);
  expect(after.rows[0].email_verified).toBe(true);
});

test("15: resending right after signup reports the wait, not a send failure", async ({ page }) => {
  await signUp(page);

  // The signup email counts against the 2-minute throttle, so the resend button
  // is always throttled for a brand-new account. It must say how long instead of
  // claiming the email could not be sent.
  const rr = await apiPost(page, "/api/auth/resend-verification");
  console.log("[verify] resend right after signup:", rr.status, JSON.stringify(rr.body));
  expect(rr.status).toBe(429);
  expect(rr.body.code).toBe("THROTTLED");
  expect(rr.body.retry_after).toBeGreaterThan(0);
  expect(rr.body.retry_after).toBeLessThanOrEqual(120);
});

test("16: a signed-in user clicking the link reaches the verify page and succeeds", async ({ page }) => {
  const creds = await signUp(page); // leaves the session cookie set, as after a real signup
  const u = await pool.query(
    `SELECT u.id FROM users u JOIN tenants t ON t.id = u.tenant_id
     WHERE t.slug LIKE $1 ORDER BY u.created_at DESC LIMIT 1`,
    [slugOf(creds.company) + "%"]
  );
  const tok = await pool.query(
    `SELECT token FROM email_verification_tokens WHERE user_id = $1 LIMIT 1`,
    [u.rows[0].id]
  );
  const token = tok.rows[0].token as string;

  // The (auth) layout bounces authenticated users to /dashboard; /verify-email
  // must be exempt or the page never mounts and the link silently does nothing.
  await page.goto(`/en/verify-email?token=${token}`);
  await expect(page.getByText(/verified successfully/i)).toBeVisible({ timeout: 20000 });

  // Re-opening the same link keeps saying success (idempotent replay).
  await page.goto(`/en/verify-email?token=${token}`);
  await expect(page.getByText(/verified successfully/i)).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/invalid or expired/i)).toHaveCount(0);
  await page.screenshot({ path: "test-results/verify-link-second-open.png" });
});

test("17: a throttled resend states the wait instead of claiming a send failure", async ({ page }) => {
  await signUp(page); // the signup email counts against the 2-minute throttle
  await page.goto("/en/verify-email");
  await page.getByRole("button", { name: /resend/i }).click();
  await expect(page.getByText(/request another in \d+s/i)).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/could not send/i)).toHaveCount(0);
  await page.screenshot({ path: "test-results/verify-resend-throttled.png" });
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
