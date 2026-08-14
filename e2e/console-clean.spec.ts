import { test, expect, type Page } from "@playwright/test";
import { signUp } from "./helpers";

/**
 * Every app page must load without a single console error, page error or failed
 * request.
 *
 * This exists because a hydration mismatch (the CSP nonce on the theme-bootstrap
 * script) sat unnoticed in the app for a long time: it is invisible in
 * production and only surfaces as a small "1 issue" badge in the dev overlay.
 * Errors like that mask the next real one, so the bar is zero.
 */
const ROUTES = [
  "dashboard",
  "clients",
  "products",
  "quotes",
  "invoices",
  "delivery-notes",
  "suppliers",
  "purchases",
  "locations",
  "expenses",
  "reports",
  "phonebook",
  "settings",
  "pos",
];

/** Noise from the harness itself, not from the application. */
function isOurs(text: string): boolean {
  return !(
    // The test env ships a deliberately invalid Resend key.
    text.includes("Email send failed") ||
    // Next.js dev-server plumbing, absent from a production build.
    text.includes("_next/static/chunks/") ||
    text.includes("Download the React DevTools")
  );
}

async function collectProblems(page: Page, routes: string[]): Promise<string[]> {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && isOurs(m.text())) problems.push(`[console] ${m.text()}`);
  });
  page.on("pageerror", (e) => {
    if (isOurs(e.message)) problems.push(`[pageerror] ${e.message}`);
  });
  page.on("requestfailed", (r) => {
    const err = r.failure()?.errorText ?? "";
    // Aborted requests are normal when a navigation supersedes an in-flight fetch.
    if (!err.includes("ERR_ABORTED")) problems.push(`[request] ${r.url()} ${err}`);
  });

  for (const route of routes) {
    await page.goto(`/en/${route}`);
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(300);
  }
  return [...new Set(problems)];
}

test("no console errors on any application page", async ({ page }) => {
  // Walking every page costs more than the suite's default budget.
  test.setTimeout(240_000);
  await signUp(page);
  const problems = await collectProblems(page, ROUTES);
  expect(problems, `Console problems:\n${problems.join("\n")}`).toEqual([]);
});
