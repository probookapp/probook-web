import { test, expect } from "@playwright/test";
import { signUp, logIn, logOut } from "./helpers";

test.describe("Authentication flows", () => {
  test("signup creates account and redirects to app", async ({ page }) => {
    await signUp(page);

    // Should be somewhere in the app (not signup or login)
    const url = page.url();
    expect(url).not.toContain("/signup");
    expect(url).not.toContain("/login");
  });

  test("login with valid credentials succeeds", async ({ page }) => {
    const creds = await signUp(page);
    await logOut(page);

    await logIn(page, creds.username, creds.password);

    // Should not be on login page
    expect(page.url()).not.toContain("/login");
  });

  test("login with wrong password shows error", async ({ page }) => {
    const creds = await signUp(page);
    await logOut(page);

    await page.goto("/en/login");
    await page.waitForLoadState("networkidle");
    await page.locator('input[autocomplete="username"]').fill(creds.username);
    await page.locator('input[autocomplete="current-password"]').fill("WrongPassword123!");
    await page.locator('button[type="submit"]').click();

    // Should show error and stay on login page
    await expect(page.locator("text=Invalid username or password").first()).toBeVisible({
      timeout: 5_000,
    });
    expect(page.url()).toContain("/login");
  });

  test("signup with short password shows validation error", async ({ page }) => {
    await page.goto("/en/signup");
    await page.waitForLoadState("networkidle");
    await page.locator('input[autocomplete="organization"]').fill("Test Co");
    await page.locator('input[autocomplete="name"]').fill("Test");
    await page.locator('input[autocomplete="username"]').fill("testuser123");
    await page.locator('input[autocomplete="new-password"]').first().fill("short");
    await page.locator('input[autocomplete="new-password"]').last().fill("short");
    await page.locator('button[type="submit"]').click();

    // Should stay on signup page (frontend validation)
    await page.waitForTimeout(2_000);
    expect(page.url()).toContain("/signup");
  });

  test("unauthenticated user is redirected to login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/en/dashboard");
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toContain("/login");
  });

  test("logout clears session cookie", async ({ page }) => {
    await signUp(page);
    await logOut(page);

    // Trying to access API should fail
    const result = await page.evaluate(async () => {
      const r = await fetch("/api/clients");
      return { status: r.status };
    });
    expect(result.status).toBe(401);
  });
});
