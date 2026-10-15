import { test, expect, type Page } from "@playwright/test";
import { signUp } from "./helpers";
import { setupClient } from "./api-helpers";

/**
 * Leaving a form that holds unsaved input asks first, whichever way out is
 * taken — and the Save button is in reach without scrolling to the bottom.
 *
 * A customer filling in a quote clicked the Back button at the top instead of
 * scrolling down to Save, and lost the quote without a word. The guard that was
 * meant to stop that intercepted history.pushState, which the App Router only
 * calls once the next page has already rendered.
 */
const DESKTOP = { width: 1366, height: 768 };

async function dirtyQuote(page: Page, { fromList = false } = {}) {
  // From the list, the editor is reached by client-side navigation, so the
  // browser Back button stays inside the app (a popstate, not a page load).
  if (fromList) {
    await page.goto("/en/quotes");
    await page.getByRole("button", { name: "New Quote" }).first().click();
    await expect(page).toHaveURL(/\/quotes\/new$/);
  } else {
    await page.goto("/en/quotes/new");
  }
  const client = page
    .locator(`xpath=.//label[normalize-space(.)="Client *"]/..`)
    .filter({ visible: true })
    .first();
  await client.locator("button").first().click();
  await page.locator('input[type="text"]').filter({ visible: true }).last().fill("Garde");
  await page.locator('li[role="option"]').filter({ hasText: "Garde SARL" }).first().click();
}

const dialog = (page: Page) => page.getByRole("dialog", { name: "Unsaved changes" });
const saveButton = (page: Page) => page.getByRole("button", { name: "Create Quote" });

test.describe("Unsaved changes", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signUp(page);
    await setupClient(page, "Garde SARL");
  });

  test("the Back button of a dirty quote asks, and Stay keeps the quote", async ({ page }) => {
    await dirtyQuote(page);

    await page.getByRole("button", { name: "Back" }).first().click();
    await expect(dialog(page)).toBeVisible();
    await expect(page).toHaveURL(/\/quotes\/new$/);

    await dialog(page).getByRole("button", { name: "Stay" }).click();
    await expect(dialog(page)).toBeHidden();
    await expect(saveButton(page)).toBeVisible();
    await expect(page).toHaveURL(/\/quotes\/new$/);

    await page.getByRole("button", { name: "Back" }).first().click();
    await dialog(page).getByRole("button", { name: "Leave" }).click();
    await expect(page).toHaveURL(/\/en\/quotes$/);
  });

  test("the Save button is on screen without scrolling", async ({ page }) => {
    await dirtyQuote(page);
    await page.locator("main").evaluate((main) => main.scrollTo(0, 0));
    await expect(saveButton(page)).toBeInViewport();
  });

  test("a sidebar link and the browser Back button both ask", async ({ page }) => {
    await dirtyQuote(page, { fromList: true });

    await page.locator('nav a[href="/en/clients"]').click();
    await expect(dialog(page)).toBeVisible();
    await dialog(page).getByRole("button", { name: "Stay" }).click();
    await expect(page).toHaveURL(/\/quotes\/new$/);

    await page.evaluate(() => window.history.back());
    await expect(dialog(page)).toBeVisible();
    await expect(page).toHaveURL(/\/quotes\/new$/);
    await dialog(page).getByRole("button", { name: "Stay" }).click();
    // Still the same quote, client picked and all.
    await expect(saveButton(page)).toBeVisible();
    await expect(page.getByText("Garde SARL").first()).toBeVisible();

    await page.evaluate(() => window.history.back());
    await dialog(page).getByRole("button", { name: "Leave" }).click();
    await expect(page).toHaveURL(/\/en\/quotes$/);
  });

  test("an untouched quote leaves without asking", async ({ page }) => {
    await page.goto("/en/quotes/new");
    await expect(saveButton(page)).toBeVisible();
    await page.getByRole("button", { name: "Back" }).first().click();
    await expect(page).toHaveURL(/\/en\/quotes$/);
    await expect(dialog(page)).toHaveCount(0);
  });

  test("edited settings ask before leaving", async ({ page }) => {
    await page.goto("/en/settings");
    await page.getByLabel("Company Name *").fill("Nouvelle raison sociale");
    await expect(page.getByRole("button", { name: "Save" }).last()).toBeInViewport();

    await page.locator('nav a[href="/en/clients"]').click();
    await expect(dialog(page)).toBeVisible();
    await expect(page).toHaveURL(/\/settings$/);
  });

  test("a client modal with input asks before Escape closes it", async ({ page }) => {
    await page.goto("/en/clients");
    await page.getByRole("button", { name: "New Client" }).first().click();
    const modal = page.getByRole("dialog", { name: "New Client" });
    await modal.getByLabel("Name / Company *").fill("Client en cours");

    await page.keyboard.press("Escape");
    await expect(dialog(page)).toBeVisible();
    await dialog(page).getByRole("button", { name: "Stay" }).click();
    await expect(modal.getByLabel("Name / Company *")).toHaveValue("Client en cours");

    await page.keyboard.press("Escape");
    await dialog(page).getByRole("button", { name: "Close without saving" }).click();
    await expect(modal).toBeHidden();
  });

  test("an untouched client modal closes on Escape at once", async ({ page }) => {
    await page.goto("/en/clients");
    await page.getByRole("button", { name: "New Client" }).first().click();
    const modal = page.getByRole("dialog", { name: "New Client" });
    await expect(modal).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(modal).toBeHidden();
    await expect(dialog(page)).toHaveCount(0);
  });
});
