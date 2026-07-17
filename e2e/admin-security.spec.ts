import { test, expect, type Page } from "@playwright/test";
import { setupPlatformAdmin, adminGet, adminPost, adminPut, adminDelete } from "./admin-helpers";

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

/**
 * Compute a current RFC-6238 TOTP code from a base32 secret, run inside the
 * browser so it uses the same Web Crypto primitives the server uses. Mirrors
 * src/lib/totp.ts (SHA-1, 30s step, 6 digits).
 */
async function currentTotp(page: Page, secret: string): Promise<string> {
  return page.evaluate(async (s: string) => {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = "";
    for (const char of s.toUpperCase()) {
      const idx = alphabet.indexOf(char);
      if (idx === -1) continue;
      bits += idx.toString(2).padStart(5, "0");
    }
    const bytes = new Uint8Array(Math.floor(bits.length / 8));
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
    }
    const time = Math.floor(Date.now() / 1000 / 30);
    const timeBuffer = new Uint8Array(8);
    new DataView(timeBuffer.buffer).setBigUint64(0, BigInt(time));
    const key = await crypto.subtle.importKey(
      "raw",
      bytes.buffer as ArrayBuffer,
      { name: "HMAC", hash: "SHA-1" },
      false,
      ["sign"]
    );
    const sig = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, timeBuffer.buffer as ArrayBuffer)
    );
    const offset = sig[sig.length - 1] & 0x0f;
    const code =
      ((sig[offset] & 0x7f) << 24) |
      ((sig[offset + 1] & 0xff) << 16) |
      ((sig[offset + 2] & 0xff) << 8) |
      (sig[offset + 3] & 0xff);
    return (code % 1000000).toString().padStart(6, "0");
  }, secret);
}

test.describe("Admin security: TOTP 2FA", () => {
  test.beforeEach(async ({ page }) => {
    await gotoLoginStable(page);
  });

  test("enable TOTP via setup + verify, then me reports it enabled", async ({ page }) => {
    await setupPlatformAdmin(page);

    // Initially disabled.
    const before = await adminGet(page, "/api/admin/auth/me");
    expect(before.status).toBe(200);
    expect(before.body.totp_enabled).toBeFalsy();

    // Begin enrollment → get the pending secret.
    const setup = await adminPost(page, "/api/admin/auth/totp/setup");
    expect(setup.status).toBe(200);
    const secret = setup.body.secret as string;
    expect(secret).toBeTruthy();
    expect(String(setup.body.uri)).toContain("otpauth://totp/");

    // Confirm enrollment with a freshly computed code.
    const code = await currentTotp(page, secret);
    const verify = await adminPost(page, "/api/admin/auth/totp/verify-setup", { code });
    expect(verify.status).toBe(200);
    expect(verify.body.success).toBe(true);

    // me now reflects 2FA enabled.
    const after = await adminGet(page, "/api/admin/auth/me");
    expect(after.status).toBe(200);
    expect(after.body.totp_enabled).toBe(true);
  });

  test("verify-setup rejects a wrong code", async ({ page }) => {
    await setupPlatformAdmin(page);
    await adminPost(page, "/api/admin/auth/totp/setup");

    const verify = await adminPost(page, "/api/admin/auth/totp/verify-setup", {
      code: "000000",
    });
    expect(verify.status).toBe(400);
  });
});

test.describe("Admin security: forgot password", () => {
  test.beforeEach(async ({ page }) => {
    await gotoLoginStable(page);
  });

  test("forgot-password endpoint always returns success (no account enumeration)", async ({ page }) => {
    // Public endpoint — no admin session required.
    const res = await adminPost(page, "/api/admin/auth/forgot-password", {
      email: `nobody_${Date.now()}@test.local`,
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test("forgot-password page loads and posts to the endpoint", async ({ page }) => {
    // Authenticate first: the (admin) route layout guards non-login pages and
    // redirects unauthenticated visitors to /admin/login.
    const admin = await setupPlatformAdmin(page);

    await page.goto("/en/admin/forgot-password");
    await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();

    await page.locator('input[type="email"]').fill(admin.email);

    const [resp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/api/admin/auth/forgot-password") &&
          r.request().method() === "POST"
      ),
      page.getByRole("button", { name: "Send reset link" }).click(),
    ]);
    expect(resp.status()).toBe(200);

    // Confirmation copy is shown after a successful submit.
    await expect(page.getByText(/reset link has been sent/i)).toBeVisible();
  });
});

test.describe("Admin security: platform-admin self / last-super-admin guards", () => {
  test.beforeEach(async ({ page }) => {
    await gotoLoginStable(page);
  });

  test("an admin cannot delete their own account", async ({ page }) => {
    const admin = await setupPlatformAdmin(page);
    const del = await adminDelete(page, `/api/admin/platform-admins/${admin.adminId}`);
    expect(del.status).toBe(400);
    expect(String(del.body.error)).toContain("own account");
  });

  test("an admin cannot deactivate their own account", async ({ page }) => {
    const admin = await setupPlatformAdmin(page);
    const res = await adminPut(page, `/api/admin/platform-admins/${admin.adminId}`, {
      is_active: false,
    });
    expect(res.status).toBe(400);
  });

  test("an admin cannot demote themselves out of super_admin", async ({ page }) => {
    const admin = await setupPlatformAdmin(page);
    const res = await adminPut(page, `/api/admin/platform-admins/${admin.adminId}`, {
      role: "support_agent",
    });
    expect(res.status).toBe(400);
  });
});
