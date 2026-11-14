import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";

/**
 * Hiding modules from the rail: saved to the account, applied on desktop and in
 * the phone drawer, and only tidying — the hidden page still opens by URL.
 */
test.describe("sidebar customisation", () => {
  test("hides a module, keeps it hidden after reload, keeps the route reachable", async ({ page }) => {
    await signUp(page);
    await page.goto("/en/dashboard");
    const rail = page.locator("aside nav");
    const phonebook = rail.getByRole("link", { name: "Phonebook" });
    await expect(phonebook).toBeVisible();

    await rail.getByTestId("sidebar-customize").click();
    // Home and settings cannot be hidden.
    await expect(rail.getByRole("button", { name: /Dashboard/ })).toBeDisabled();
    await expect(rail.getByRole("button", { name: /Settings/ })).toBeDisabled();

    const saved = page.waitForResponse(
      (r) => r.url().includes("/api/auth/table-preferences") && r.request().method() === "PUT"
    );
    await rail.getByRole("button", { name: "Hide Phonebook" }).click();
    expect((await saved).ok()).toBe(true);
    await expect(rail.getByRole("button", { name: "Show Phonebook" })).toHaveAttribute("aria-pressed", "false");
    await page.screenshot({ path: "test-results/sidebar-customize-editing.png" });
    await rail.getByRole("button", { name: "Done" }).click();

    await expect(phonebook).toHaveCount(0);
    await expect(rail.getByTestId("sidebar-customize")).toHaveText("Customize menu (1 hidden)");

    // Saved server-side: survives a reload with the local query cache cleared.
    await page.evaluate(async () => {
      for (const db of await indexedDB.databases()) if (db.name) indexedDB.deleteDatabase(db.name);
    });
    await page.reload();
    await expect(rail.getByRole("link", { name: "Clients" })).toBeVisible();
    await expect(phonebook).toHaveCount(0);
    await page.screenshot({ path: "test-results/sidebar-customize-desktop.png" });

    // Hiding is not disabling: the page opens, and its entry stays lit while on it.
    await page.goto("/en/phonebook");
    await expect(page).toHaveURL(/\/en\/phonebook/);
    await expect(phonebook).toBeVisible();

    // Phone drawer reads the same preference.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en/dashboard");
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(rail.getByRole("link", { name: "Clients" })).toBeVisible();
    await expect(phonebook).toHaveCount(0);
    await page.screenshot({ path: "test-results/sidebar-customize-mobile.png" });

    // And back.
    await rail.getByTestId("sidebar-customize").click();
    await rail.getByRole("button", { name: "Show all" }).click();
    await rail.getByRole("button", { name: "Done" }).click();
    await expect(phonebook).toBeVisible();
  });
});
