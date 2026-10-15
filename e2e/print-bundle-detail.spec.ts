import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";
import { apiGet, apiPut } from "./api-helpers";
import { reloadWithFreshCache } from "./query-cache";

/**
 * Whether a pack lists its components on quote and invoice PDFs. On by
 * default, so documents print as they always did until a tenant turns it off.
 */
test.describe("Pack detail on documents", () => {
  test("is on by default and saved from the settings screen", async ({ page }) => {
    await signUp(page);
    const initial = await apiGet(page, "/api/settings");
    expect(initial.body.print_bundle_detail).toBe(true);

    await page.goto("/fr/settings");
    await reloadWithFreshCache(page);
    const box = page.locator('input[name="print_bundle_detail"]');
    await expect(box).toBeChecked();

    await box.uncheck();
    const saved = page.waitForResponse(
      (r) => r.url().includes("/api/settings") && r.request().method() === "PUT" && r.ok()
    );
    await page.getByRole("button", { name: /^(Save|Enregistrer)$/i }).first().click();
    await saved;

    const after = await apiGet(page, "/api/settings");
    expect(after.body.print_bundle_detail).toBe(false);

    // And back through the API, as a restore or another screen would.
    const restored = await apiPut(page, "/api/settings", { print_bundle_detail: true });
    expect(restored.status).toBe(200);
    expect(restored.body.print_bundle_detail).toBe(true);
  });
});
