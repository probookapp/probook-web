import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";
import { apiGet, apiPost, apiDelete } from "./api-helpers";

test.describe("TOTP 2FA setup", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("setup returns secret and URI", async ({ page }) => {
    const setup = await apiPost(page, "/api/auth/totp/setup");
    expect(setup.status).toBe(200);
    expect(setup.body.secret).toBeTruthy();
    expect(typeof setup.body.secret).toBe("string");
    expect(setup.body.uri).toBeTruthy();
    expect((setup.body.uri as string)).toContain("otpauth://totp/");
  });

  test("verify-setup rejects invalid code", async ({ page }) => {
    await apiPost(page, "/api/auth/totp/setup");

    const verify = await apiPost(page, "/api/auth/totp/verify-setup", {
      code: "000000",
    });
    expect(verify.status).toBe(400);
    expect(verify.body.error).toContain("Invalid");
  });

  test("disable rejects wrong password", async ({ page }) => {
    const disable = await apiPost(page, "/api/auth/totp/disable", {
      password: "WrongPassword!",
    });
    expect(disable.status).toBe(401);
  });
});

test.describe("Session management", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("list active sessions", async ({ page }) => {
    const sessions = await apiGet(page, "/api/auth/sessions");
    expect(sessions.status).toBe(200);
    expect(Array.isArray(sessions.body)).toBe(true);
    expect((sessions.body as unknown as unknown[]).length).toBeGreaterThanOrEqual(1);

    // Current session should be marked
    const current = (sessions.body as unknown as Array<Record<string, unknown>>).find(
      (s) => s.is_current === true
    );
    expect(current).toBeTruthy();
  });

  test("revoke a session", async ({ page }) => {
    // List sessions
    const sessions = await apiGet(page, "/api/auth/sessions");
    const sessionList = sessions.body as unknown as Array<Record<string, unknown>>;
    const currentSession = sessionList.find((s) => s.is_current);
    expect(currentSession).toBeTruthy();

    // Revoke current session
    const revoke = await apiDelete(page, `/api/auth/sessions/${currentSession!.id}`);
    expect(revoke.status).toBe(200);
  });
});

test.describe("Change password", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("change password with correct current password", async ({ page }) => {
    const res = await apiPost(page, "/api/auth/change-password", {
      current_password: "Test1234!",
      new_password: "NewPassword123!",
    });
    expect(res.status).toBe(204);
  });

  test("change password rejects wrong current password", async ({ page }) => {
    const res = await apiPost(page, "/api/auth/change-password", {
      current_password: "WrongPassword!",
      new_password: "NewPassword123!",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("incorrect");
  });

  test("change password rejects short new password", async ({ page }) => {
    const res = await apiPost(page, "/api/auth/change-password", {
      current_password: "Test1234!",
      new_password: "short",
    });
    expect(res.status).toBe(400);
  });
});
