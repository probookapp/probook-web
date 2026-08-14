import { test } from "@playwright/test";
import { signUp } from "./helpers";
import { setupClient, setupProduct } from "./api-helpers";

/**
 * Measure the quote line editor at phone width, in both view modes.
 *
 * Not an assertion — a ruler. Design decisions about the mobile form should
 * rest on what the page actually renders, not on an estimate.
 *
 * Run: npx playwright test e2e/measure-line-editor.spec.ts
 */
test("measure the phone line editor at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signUp(page);
  await setupClient(page, "Mesure SARL");
  await setupProduct(page, "Caméra IP extérieure", 24500, { quantity: 10 });

  await page.goto("/fr/quotes/new");
  await page.waitForLoadState("networkidle").catch(() => {});

  // Six lines, the length of a real small job.
  for (let i = 0; i < 5; i++) {
    await page.getByRole("button", { name: /Ajouter une ligne/i }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: /Terminer la ligne/i }).click();
    await page.waitForTimeout(150);
  }

  const measured = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("li > button")] as HTMLElement[];
    const doc = document.documentElement;
    return {
      lines: rows.length,
      rowHeight: rows[0] ? Math.round(rows[0].getBoundingClientRect().height) : null,
      onScreen: rows.filter((r) => {
        const b = r.getBoundingClientRect();
        return b.top >= 0 && b.bottom <= window.innerHeight;
      }).length,
      overflowX: doc.scrollWidth - doc.clientWidth,
    };
  });

  console.log("[measure] phone editor:", JSON.stringify(measured));
});
