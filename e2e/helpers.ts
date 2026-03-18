import { type Page, expect } from "@playwright/test";

const LOCALE = "en";

/**
 * Sign up a new account and return credentials.
 * After this, the browser is logged in and on the dashboard.
 */
export async function signUp(
  page: Page,
  opts?: { company?: string; username?: string; password?: string }
) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const company = opts?.company ?? `E2E Co ${id}`;
  const username = opts?.username ?? `e2euser_${id}`;
  const password = opts?.password ?? "Test1234!";

  await page.goto(`/${LOCALE}/signup`);
  await page.waitForLoadState("networkidle");
  await page.locator('input[autocomplete="organization"]').fill(company);
  await page.locator('input[autocomplete="name"]').fill(`Test User ${id}`);
  await page.locator('input[autocomplete="username"]').fill(username);
  await page.locator('input[autocomplete="new-password"]').first().fill(password);
  // Confirm password field
  await page.locator('input[autocomplete="new-password"]').last().fill(password);

  await page.locator('button[type="submit"]').click();

  // Wait for redirect to dashboard or subscription wall
  await page.waitForURL(new RegExp(`/${LOCALE}/(dashboard|settings)`), {
    timeout: 15_000,
  });

  return { company, username, password };
}

/**
 * Log in with existing credentials.
 * After this, the browser is logged in.
 */
export async function logIn(
  page: Page,
  username: string,
  password: string
) {
  await page.goto(`/${LOCALE}/login`);
  await page.waitForLoadState("networkidle");
  await page.locator('input[autocomplete="username"]').fill(username);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.locator('button[type="submit"]').click();

  // Wait for redirect away from login
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 15_000,
  });
}

/**
 * Log out by calling the API and navigating to login.
 * Works regardless of whether we're on the subscription wall or main app.
 */
export async function logOut(page: Page) {
  await page.evaluate(() =>
    fetch("/api/auth/logout", { method: "POST", credentials: "include" })
  );
  await page.context().clearCookies();
  await page.goto(`/${LOCALE}/login`);
  await page.waitForLoadState("networkidle");
}

/**
 * Create a client via the API directly (faster than UI for setup).
 */
export async function createClientViaApi(page: Page, name: string) {
  const res = await page.evaluate(
    async (clientName) => {
      const r = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: clientName }),
      });
      return r.json();
    },
    name
  );
  return res;
}

/**
 * Create a product via the API directly.
 */
export async function createProductViaApi(
  page: Page,
  designation: string,
  unitPrice: number
) {
  const res = await page.evaluate(
    async ([desig, price]) => {
      const r = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          designation: desig,
          unit_price: Number(price),
          tax_rate: 20,
          unit: "unit",
          is_service: false,
        }),
      });
      return r.json();
    },
    [designation, unitPrice.toString()]
  );
  return res;
}

/**
 * Create an invoice via the API directly.
 */
export async function createInvoiceViaApi(
  page: Page,
  clientId: string,
  lines: Array<{ description: string; quantity: number; unit_price: number; tax_rate: number }>
) {
  const res = await page.evaluate(
    async ([cid, lns]) => {
      const r = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: cid,
          issue_date: new Date().toISOString().slice(0, 10),
          lines: JSON.parse(lns as string),
        }),
      });
      return r.json();
    },
    [clientId, JSON.stringify(lines)]
  );
  return res;
}

/**
 * Assert no cross-tenant data is visible on a page.
 * Pass the data name that should NOT appear.
 */
export async function assertNoDataVisible(page: Page, forbiddenText: string) {
  const content = await page.textContent("body");
  expect(content).not.toContain(forbiddenText);
}

/**
 * Navigate to a specific app page.
 */
export async function navigateTo(page: Page, path: string) {
  await page.goto(`/${LOCALE}/${path}`);
  await page.waitForLoadState("networkidle");
}
