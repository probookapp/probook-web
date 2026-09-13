import { test, expect, type Page } from "@playwright/test";

/**
 * The pricing page has to say what each offer contains.
 *
 * It did not. The entry offer adds no module by construction — it *is* the core
 * product — and the card only rendered a list when the offer linked features,
 * so Essential showed a price and nothing beneath it: the offer that contains
 * the most looked like the one that contains nothing. And no card mentioned the
 * number of users, though seats are half the difference between one offer and
 * the next.
 *
 * This is a public page: it runs without signing in, which is also how a
 * prospect meets it.
 */
interface PublishedPlan {
  name: string;
  monthly_price: number;
  currency: string;
  base_currency?: string;
  features?: unknown[];
}

/** What the shop window is actually serving, read the way the page reads it. */
async function publishedPlans(page: Page): Promise<PublishedPlan[]> {
  return page.evaluate(async () => {
    const res = await fetch("/api/subscription/plans");
    const data = await res.json();
    return (data.plans || []) as PublishedPlan[];
  });
}

async function openPricing(page: Page) {
  await page.goto("/fr/pricing");
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
}

test.describe("the pricing page", () => {
  test("every offer says what it includes and how many users it covers", async ({ page }) => {
    await openPricing(page);
    const plans = await publishedPlans(page);
    test.skip(plans.length === 0, "no offer is published");

    // Counted against the number of offers rather than looked for once: the bug
    // was one card missing its list, which a single match would have hidden.
    await expect(page.getByText("Factures, acomptes et règlements")).toHaveCount(plans.length);
    await expect(page.getByText("Catalogue produits et clients")).toHaveCount(plans.length);

    const seats = page.getByText(/Utilisateurs\s*:\s*\d+|Utilisateurs illimités/);
    await expect(seats).toHaveCount(plans.length);
  });

  test("an offer that adds modules shows them apart from the core", async ({ page }) => {
    await openPricing(page);
    const plans = await publishedPlans(page);
    test.skip(plans.length === 0, "no offer is published");

    // Counted against the offers that actually carry modules, not against the
    // total: the shared test database gains offers from other suites, and an
    // assertion phrased as "rarer than the whole catalogue" was really an
    // assertion about what those suites happened to create.
    const withModules = plans.filter((p) => (p.features?.length ?? 0) > 0).length;
    await expect(page.getByText("Et en plus")).toHaveCount(withModules);
  });

  test("the shop window quotes one currency", async ({ page }) => {
    await openPricing(page);
    const plans = await publishedPlans(page);
    test.skip(plans.length === 0, "no offer is published");

    // Two offers in dinars beside one in euros is what a stale per-currency row
    // produced in production, and it is worse than either alone.
    const currencies = new Set(plans.map((p) => p.currency));
    expect([...currencies], "one currency across the page").toHaveLength(1);
  });
});
