import { test, expect, type Page } from "@playwright/test";
import { signUp } from "./helpers";
import { setupClient, setupProduct } from "./api-helpers";

/**
 * The phone line editor.
 *
 * The point of the redesign is that a document reads as a list and edits one
 * line at a time, so these tests check the two things that makes true: a folded
 * line shows what it is worth without being opened, and everything the wide
 * editor can do is still reachable through the sheet.
 *
 * The wide editor is covered by e2e/dense-line-editor.spec.ts; here the viewport
 * is 390px throughout, and the grid must not be on screen at all.
 */
const PHONE = { width: 390, height: 844 };

async function newQuote(page: Page) {
  await page.goto("/fr/quotes/new");
  await expect(page.getByRole("button", { name: /Ajouter une ligne/i }).first()).toBeVisible();
}

/** The folded row for line `index`, which is also the way into the sheet. */
function foldedLine(page: Page, index: number) {
  return page.locator("li > button").nth(index);
}

async function openLine(page: Page, index: number) {
  await foldedLine(page, index).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

async function closeSheet(page: Page) {
  await page.getByRole("dialog").getByRole("button", { name: /Terminer la ligne/i }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

test.describe("Phone line editor", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(PHONE);
    await signUp(page);
    await setupClient(page, "Comptoir Mobile");
    await setupProduct(page, "Caméra IP extérieure 5MP", 24500, { quantity: 20 });
  });

  test("shows the folded list instead of the wide grid", async ({ page }) => {
    await newQuote(page);

    // The grid's per-line fields are the thing being replaced: none of them
    // should be on screen until a line is opened.
    await expect(page.locator('input[name="lines.0.unit_price"]')).toHaveCount(0);
    await expect(foldedLine(page, 0)).toBeVisible();
  });

  test("a line can be filled from the sheet and reads back folded", async ({ page }) => {
    await newQuote(page);
    await openLine(page, 0);

    const sheet = page.getByRole("dialog");
    await sheet.locator('input[name="lines.0.description"]').fill("Pose de caméras");
    await sheet.locator('input[name="lines.0.quantity"]').fill("3");
    await sheet.locator('input[name="lines.0.unit_price"]').fill("15000");
    await sheet.locator('input[name="lines.0.tax_rate"]').fill("19");

    // The sheet totals the line while it is being typed.
    await expect(sheet.getByText("53 550,00", { exact: false })).toBeVisible();
    await closeSheet(page);

    // Folded: quantity, description and amount, without opening anything.
    const folded = foldedLine(page, 0);
    await expect(folded).toContainText("3 ×");
    await expect(folded).toContainText("Pose de caméras");
    await expect(folded).toContainText("53 550,00");
  });

  test("the numeric fields ask the phone for a numeric keyboard", async ({ page }) => {
    await newQuote(page);
    await openLine(page, 0);
    const sheet = page.getByRole("dialog");

    // No keypad of our own: inputMode is what makes the phone offer digits, and
    // it keeps paste, decimal commas and assistive technology working.
    for (const field of ["quantity", "unit_price", "tax_rate"]) {
      await expect(sheet.locator(`input[name="lines.0.${field}"]`)).toHaveAttribute(
        "inputmode",
        "decimal"
      );
    }
  });

  test("adding a line opens it straight away", async ({ page }) => {
    await newQuote(page);
    await page.getByRole("button", { name: /Ajouter une ligne/i }).first().click();

    // Adding then hunting for the new row would be two gestures.
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText("Ligne 2");
    await closeSheet(page);

    await expect(page.locator("li > button")).toHaveCount(2);
  });

  test("a line can be deleted from its own sheet", async ({ page }) => {
    await newQuote(page);
    await page.getByRole("button", { name: /Ajouter une ligne/i }).first().click();
    await closeSheet(page);
    await expect(page.locator("li > button")).toHaveCount(2);

    await openLine(page, 1);
    await page.getByRole("dialog").getByRole("button", { name: /Supprimer/i }).click();
    await expect(page.locator("li > button")).toHaveCount(1);
  });

  test("the running total sits above the lines, not several screens below", async ({ page }) => {
    await newQuote(page);
    await openLine(page, 0);
    const sheet = page.getByRole("dialog");
    await sheet.locator('input[name="lines.0.description"]').fill("Prestation");
    await sheet.locator('input[name="lines.0.quantity"]').fill("2");
    await sheet.locator('input[name="lines.0.unit_price"]').fill("10000");
    await sheet.locator('input[name="lines.0.tax_rate"]').fill("0");
    await closeSheet(page);

    const summary = page.getByText(/^1 ligne$/);
    await expect(summary).toBeVisible();
    // Above the first folded line, so it is on screen while the lines are read.
    const summaryBox = await summary.boundingBox();
    const firstLineBox = await foldedLine(page, 0).boundingBox();
    expect(summaryBox!.y).toBeLessThan(firstLineBox!.y);
  });

  test("a quote written entirely on the phone saves with the right total", async ({ page }) => {
    await newQuote(page);

    // The client field is a searchable select: a trigger button, then a filter
    // input, then a list — not a labelled input.
    const clientField = page.locator('xpath=.//label[contains(., "Client")]/..').first();
    await clientField.locator("button").first().click();
    await clientField.locator('input[type="text"]').first().fill("Comptoir");
    await page.locator('li[role="option"]').filter({ hasText: "Comptoir Mobile" }).first().click();

    await openLine(page, 0);
    const sheet = page.getByRole("dialog");
    await sheet.locator('input[name="lines.0.description"]').fill("Installation");
    await sheet.locator('input[name="lines.0.quantity"]').fill("2");
    await sheet.locator('input[name="lines.0.unit_price"]').fill("20000");
    await sheet.locator('input[name="lines.0.tax_rate"]').fill("19");
    await closeSheet(page);

    await page.getByRole("button", { name: /^Créer le devis$/i }).click();
    await expect(page).toHaveURL(/\/quotes/);
    await expect(page.getByText("47 600,00", { exact: false }).first()).toBeVisible();
  });

  test("nothing scrolls sideways while editing", async ({ page }) => {
    await newQuote(page);
    await openLine(page, 0);
    await page.getByRole("dialog").locator('input[name="lines.0.description"]').fill(
      "Installation complète du système de vidéosurveillance sur trois bâtiments"
    );

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe("Wide screens keep the grid", () => {
  test("the grid editor is still what a desktop shows", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signUp(page);
    await setupClient(page, "Bureau");
    await page.goto("/fr/quotes/new");

    // The redesign is a phone layout, not a replacement: the wide editor is
    // where twenty lines are typed at a desk.
    await expect(page.locator('input[name="lines.0.unit_price"]')).toBeVisible();
    await expect(page.getByRole("button", { name: /Vue dense|Vue détaillée/ })).toBeVisible();
  });
});

test.describe("The three documents share the editor", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(PHONE);
    await signUp(page);
    await setupClient(page, "Comptoir Mobile");
    await setupProduct(page, "Caméra IP extérieure 5MP", 24500, { quantity: 20 });
  });

  for (const route of ["quotes/new", "invoices/new", "delivery-notes/new"]) {
    test(`${route} folds its lines`, async ({ page }) => {
      await page.goto(`/fr/${route}`);
      await expect(page.locator("li > button").first()).toBeVisible();
      // The grid's own fields stay out of the way until a line is opened.
      await expect(page.locator('input[name="lines.0.quantity"]')).toHaveCount(0);
    });
  }

  test("a delivery note edits quantities and no money", async ({ page }) => {
    await page.goto("/fr/delivery-notes/new");
    await page.locator("li > button").first().click();

    const sheet = page.getByRole("dialog");
    await expect(sheet.locator('input[name="lines.0.quantity"]')).toBeVisible();
    // A delivery note states what left the shelf, not what it costs.
    await expect(sheet.locator('input[name="lines.0.unit_price"]')).toHaveCount(0);
    await expect(sheet.locator('input[name="lines.0.tax_rate"]')).toHaveCount(0);
  });
});
