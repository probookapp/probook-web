import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";
import { setupClient, setupProduct } from "./api-helpers";

/**
 * The dense line editor.
 *
 * A trade counter typing twenty lines needs rows, not cards. Dense mode drops
 * the per-field labels and the grouping row, which is exactly the sort of change
 * that can quietly make a field unreachable — so these tests fill a document in
 * dense mode, and do it again at phone width.
 */
async function openNewQuote(page: import("@playwright/test").Page) {
  await page.goto("/fr/quotes/new");
  await expect(page.getByRole("button", { name: /Vue dense|Vue détaillée/ })).toBeVisible();
}

async function enableDense(page: import("@playwright/test").Page) {
  const toggle = page.getByRole("button", { name: /Vue dense|Vue détaillée/ });
  if ((await toggle.getAttribute("aria-pressed")) !== "true") await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
}

test.describe("Dense line editor", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
    await setupClient(page, "Comptoir SARL");
    await setupProduct(page, "Câble HDMI 2m", 1200, { quantity: 40 });
  });

  test("a line can still be filled once the labels are gone", async ({ page }) => {
    await openNewQuote(page);
    await enableDense(page);

    // Labels are what dense mode removes, so the fields are reached by their
    // accessible name — which must survive.
    await page.getByLabel("Description", { exact: true }).first().fill("Pose de caméras");
    await page.getByLabel("Qté", { exact: true }).first().fill("3");
    await page.getByLabel("Prix HT", { exact: true }).first().fill("15000");

    await expect(page.getByLabel("Description", { exact: true }).first()).toHaveValue(
      "Pose de caméras"
    );
    await expect(page.getByLabel("Qté", { exact: true }).first()).toHaveValue("3");
  });

  test("the preference is remembered across visits", async ({ page }) => {
    await openNewQuote(page);
    await enableDense(page);

    await page.reload();
    await expect(page.getByRole("button", { name: /Vue dense|Vue détaillée/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  // Phone width is no longer this editor's business: below lg the form renders
  // DocumentLinesMobile instead, and the dense toggle goes with the grid it
  // compresses. See e2e/mobile-line-editor.spec.ts.
  test("grouping stays reachable on the lines that use it", async ({ page }) => {
    await openNewQuote(page);
    // In detailed mode the group field is always there…
    const group = page.getByPlaceholder(/Groupe/i).first();
    await expect(group).toBeVisible();
    await group.fill("Lot 1 — Câblage");

    // …and dense mode keeps it on a line that already carries one.
    await enableDense(page);
    await expect(page.getByPlaceholder(/Groupe/i).first()).toHaveValue("Lot 1 — Câblage");
  });
});
