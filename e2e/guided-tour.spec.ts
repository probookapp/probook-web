import { test, expect, type Page } from "@playwright/test";
import { signUp } from "./helpers";
import { apiGet, apiPost, openSession, setupClient, setupRegister } from "./api-helpers";

/**
 * The guided tours. In an automated browser they never start on their own
 * (they would sit over the first click of every other test), so these tests
 * open them the way a person replays them: the help button, the till's menu.
 */

async function toursSeen(page: Page) {
  const res = await apiGet(page, "/api/auth/me");
  return res.body.tours_completed as string[];
}

test.describe("Guided tours", () => {
  test("a new account starts with no tour seen, and none starts by itself here", async ({ page }) => {
    await signUp(page);
    expect(await toursSeen(page)).toEqual([]);
    await page.goto("/fr/dashboard");
    await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();
    await expect(page.getByTestId("tour")).toHaveCount(0);
  });

  test("the office tour walks the rail, is saved when skipped, and leaves the checklist", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 820 });
    await signUp(page);
    await page.goto("/fr/dashboard");

    await page.getByRole("button", { name: "Visite guidée" }).click();
    const tour = page.getByTestId("tour");
    await expect(tour.getByRole("heading", { name: "Vos clients et vos produits" })).toBeVisible();
    await tour.getByRole("button", { name: "Suivant" }).click();
    await expect(tour.getByRole("heading", { name: "Devis, factures, bons de livraison" })).toBeVisible();
    await tour.getByRole("button", { name: "Suivant" }).click();
    await expect(tour.getByRole("heading", { name: "Votre activité en un coup d'œil" })).toBeVisible();

    await tour.getByRole("button", { name: "Passer la visite" }).click();
    await expect(tour).toHaveCount(0);
    await expect.poll(() => toursSeen(page)).toContain("office");

    // Seen: the checklist takes over, with nothing ticked on a fresh account.
    const checklist = page.getByRole("region", { name: "Premiers pas" });
    await expect(checklist).toBeVisible();
    await expect(checklist.getByText("0 sur 5 terminés")).toBeVisible();
  });

  test("the checklist ticks what exists and goes away when hidden", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 820 });
    await signUp(page);
    await apiPost(page, "/api/auth/tours", { tour: "office" });
    await setupClient(page, "Premier Client SARL");

    const progress = (await apiGet(page, "/api/onboarding")).body;
    expect(progress.first_client).toBe(true);
    expect(progress.first_invoice).toBe(false);

    await page.goto("/fr/dashboard");
    const checklist = page.getByRole("region", { name: "Premiers pas" });
    await expect(checklist.getByText("1 sur 5 terminés")).toBeVisible();
    await checklist.getByRole("button", { name: "Masquer" }).click();
    await expect(checklist).toHaveCount(0);
    await expect.poll(() => toursSeen(page)).toContain("checklist");

    await page.reload();
    await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Premiers pas" })).toHaveCount(0);
  });

  test("the till tour replays from the till's menu and is saved when ended", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 820 });
    await signUp(page);
    const register = await setupRegister(page, "Caisse visite");
    await openSession(page, register.id as string);
    await page.goto("/fr/pos");

    await page.getByRole("button", { name: /^Menu/ }).click();
    await page.getByRole("button", { name: "Revoir la visite" }).click();
    const tour = page.getByTestId("tour");
    await expect(tour.getByText("Caisse · 1 / 4")).toBeVisible();
    await expect(tour.getByRole("heading", { name: "Scannez ou cherchez" })).toBeVisible();
    for (const title of ["Le panier", "Encaisser", "Le menu de la caisse"]) {
      await tour.getByRole("button", { name: "Suivant" }).click();
      await expect(tour.getByRole("heading", { name: title })).toBeVisible();
    }
    await tour.getByRole("button", { name: "C'est parti" }).click();
    await expect(tour).toHaveCount(0);
    await expect.poll(() => toursSeen(page)).toContain("pos");
  });

  test("an unknown tour is refused", async ({ page }) => {
    await signUp(page);
    const res = await apiPost(page, "/api/auth/tours", { tour: "admin" });
    expect(res.status).toBe(400);
  });
});
