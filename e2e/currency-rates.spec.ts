import { test, expect, type Page } from "@playwright/test";
import { signUp } from "./helpers";
import { apiGet, apiPost } from "./api-helpers";
import { setupPlatformAdmin, adminGet, adminPut, adminPost, createTestPlan } from "./admin-helpers";

/**
 * Publishing the grid in another currency.
 *
 * Every price is written once, in DZD. The first attempt at selling abroad was
 * a second set of hand-typed figures, and on 2026-09-13 it did exactly what a
 * second set of figures does: Enterprise was reseeded at 7 900 DZD while a
 * leftover row went on quoting 30 EUR, and nothing could notice, because the
 * two numbers had no relationship to keep.
 *
 * A rate has one. These tests hold it to that: change the dinar price and every
 * currency moves with it; remove the rate and the currency is simply not
 * offered rather than quoted wrongly.
 */
const CODE = "XTS"; // a test-only code, so real rates are never disturbed

async function setRate(page: Page, perDzd: number, roundTo = 100) {
  const res = await adminPut(page, "/api/admin/currency-rates", {
    code: CODE,
    per_dzd: perDzd,
    round_to: roundTo,
  });
  expect(res.status, JSON.stringify(res.body).slice(0, 200)).toBe(200);
}

async function dropRate(page: Page) {
  // Through the page so the admin cookie rides along; there is no DELETE helper.
  await page.evaluate(async (code) => {
    await fetch(`/api/admin/currency-rates?code=${code}`, {
      method: "DELETE",
      credentials: "include",
    });
  }, CODE);
}

/** The shop window as a visitor in that currency would see it. */
async function windowIn(page: Page, currency: string) {
  const res = await apiGet(page, `/api/subscription/plans?currency=${currency}`);
  expect(res.status).toBe(200);
  return res.body as unknown as {
    plans: { slug: string; monthly_price: number; currency: string; base_currency?: string }[];
    seat_price?: number;
  };
}

test.describe("publishing the grid in another currency", () => {
  test("a currency with no rate is not offered, it is left in dinars", async ({ page }) => {
    await signUp(page);
    await setupPlatformAdmin(page);
    await dropRate(page);

    const shown = await windowIn(page, CODE);
    test.skip(shown.plans.length === 0, "no offer is published");

    // Quoting an unconverted figure under a foreign label is the one outcome
    // worse than not offering the currency at all.
    for (const plan of shown.plans) {
      expect(plan.currency, "unpriced currency falls back to the catalogue").toBe(
        plan.base_currency
      );
    }
  });

  test("every price moves together when the rate is set", async ({ page }) => {
    await signUp(page);
    await setupPlatformAdmin(page);

    const dinars = await windowIn(page, "DZD");
    test.skip(dinars.plans.length === 0, "no offer is published");

    await setRate(page, 0.01, 100);
    const converted = await windowIn(page, CODE);

    for (const plan of converted.plans) {
      const source = dinars.plans.find((p) => p.slug === plan.slug);
      expect(source, `${plan.slug} should exist in both`).toBeTruthy();
      expect(plan.currency).toBe(CODE);
      // Rounded up to the step, so never a discount nobody decided to give.
      expect(plan.monthly_price).toBeGreaterThanOrEqual(source!.monthly_price * 0.01);
      expect(plan.monthly_price % 100).toBe(0);
    }

    // The order of the grid survives: an offer that costs more in dinars must
    // not come out cheaper elsewhere.
    const order = converted.plans.map((p) => p.monthly_price);
    expect(order).toEqual([...order].sort((a, b) => a - b));

    await dropRate(page);
  });

  test("the seat price travels with the offers", async ({ page }) => {
    await signUp(page);
    await setupPlatformAdmin(page);

    const dinars = await windowIn(page, "DZD");
    await setRate(page, 0.01, 100);
    const converted = await windowIn(page, CODE);

    expect(dinars.seat_price, "seats are quoted at all").toBeTruthy();
    // A seat left in dinars beside offers in another currency is the mismatch
    // the composer would silently add up.
    expect(converted.seat_price).not.toBe(dinars.seat_price);
    expect(converted.seat_price! % 100).toBe(0);

    await dropRate(page);
  });

  test("a composition is billed in the currency it was composed in", async ({ page }) => {
    await signUp(page);
    const verified = await apiPost(page, "/api/test/verify-email", {});
    expect(verified.status).toBe(200);

    await setupPlatformAdmin(page);

    // A module has to be sellable for the composer to price anything.
    const features = await adminGet(page, "/api/admin/features");
    const priced = (features.body as unknown as { key: string; unit_price: number | null }[]).find(
      (f) => f.unit_price != null
    );
    const moduleKey = priced?.key ?? `composable_${Date.now()}`;
    if (!priced) {
      const made = await adminPost(page, "/api/admin/features", {
        key: moduleKey,
        name: "Composable module",
        is_global: false,
        unit_price: 70_000,
      });
      expect(made.status).toBe(201);
    }

    const plans = await apiGet(page, "/api/subscription/plans");
    if ((plans.body.plans as unknown[]).length === 0) {
      await createTestPlan(page, {
        slug: `base-${Date.now()}`,
        name: `Base ${Date.now()}`,
        monthly_price: 190_000,
        yearly_price: 1_900_000,
        currency: "DZD",
        // Deliberately bare: this stands in for the entry offer, and letting the
        // helper attach every module would misrepresent the catalogue to any
        // other suite reading the same shop window.
        feature_ids: [],
      });
    }

    // With no rate, the request is refused rather than billed at an invented one.
    await dropRate(page);
    const refused = await apiPost(page, "/api/subscription/request", {
      billing_cycle: "monthly",
      request_type: "new",
      currency: CODE,
      custom: { feature_keys: [moduleKey], seats: 1 },
    });
    expect(refused.status, JSON.stringify(refused.body)).toBe(400);
    expect(refused.body.code).toBe("CURRENCY_NOT_COMPOSABLE");

    // With one, it goes through and the minted offer carries that currency.
    await setRate(page, 0.01, 100);
    const accepted = await apiPost(page, "/api/subscription/request", {
      billing_cycle: "monthly",
      request_type: "new",
      currency: CODE,
      custom: { feature_keys: [moduleKey], seats: 1 },
    });
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(201);

    const all = await adminGet(page, "/api/admin/plans");
    const minted = (all.body as unknown as { id: string; currency: string }[]).find(
      (p) => p.id === accepted.body.target_plan_id
    );
    expect(minted?.currency, "the offer is billed in what was quoted").toBe(CODE);

    await dropRate(page);
  });

  test("a nonsense rate is refused", async ({ page }) => {
    await signUp(page);
    await setupPlatformAdmin(page);

    // Zero would publish the whole catalogue free; a four-letter code is not a
    // currency. Both are typos, and both must fail where they are typed.
    const zero = await adminPut(page, "/api/admin/currency-rates", {
      code: CODE,
      per_dzd: 0,
    });
    expect(zero.status).toBe(400);

    const nonsense = await adminPut(page, "/api/admin/currency-rates", {
      code: "EUROS",
      per_dzd: 0.0069,
    });
    expect(nonsense.status).toBe(400);
  });
});
