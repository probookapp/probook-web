import { test, expect, type Page } from "@playwright/test";
import { signUp } from "./helpers";
import { apiPost } from "./api-helpers";
import { setupPlatformAdmin, adminPost, adminPut, createTestPlan } from "./admin-helpers";

/**
 * A coupon, from the code typed on the subscription screen to the price billed.
 *
 * Nothing covered this, and it showed: the screen never sent the offer the
 * coupon was checked against, so every code was refused; the check never
 * returned the code, so an accepted one would have been dropped from the
 * request; and a fixed amount was subtracted in whatever currency it was
 * written in, from a price in whatever currency the offer was quoted in.
 *
 * These hold the three places that read a coupon — the check, the screen's
 * arithmetic (same rules, lib/plan-pricing) and the approval — to one figure.
 */

type AnyRecord = Record<string, unknown>;

const RATE_CODE = "XTS"; // test-only, as in currency-rates.spec.ts

async function setRate(page: Page, perDzd: number, roundTo: number) {
  const res = await adminPut(page, "/api/admin/currency-rates", {
    code: RATE_CODE,
    per_dzd: perDzd,
    round_to: roundTo,
  });
  expect(res.status, JSON.stringify(res.body).slice(0, 200)).toBe(200);
}

async function dropRate(page: Page) {
  await page.evaluate(async (code) => {
    await fetch(`/api/admin/currency-rates?code=${code}`, {
      method: "DELETE",
      credentials: "include",
    });
  }, RATE_CODE);
}

/** A fresh tenant allowed to subscribe, a platform admin, and a 10 000 DZD/year offer. */
async function setup(page: Page) {
  await signUp(page);
  await setupPlatformAdmin(page);
  const verified = await apiPost(page, "/api/test/verify-email");
  expect(verified.status).toBe(200);

  const plan = await createTestPlan(page, {
    slug: `coupon-plan-${Date.now()}`,
    name: `Coupon Plan ${Date.now()}`,
    monthly_price: 100_000,
    yearly_price: 1_000_000,
    currency: "DZD",
  });
  expect(plan.status).toBe(201);
  return plan.body.id as string;
}

async function createCoupon(page: Page, body: AnyRecord) {
  const code = `E2E${Date.now()}`;
  const res = await adminPost(page, "/api/admin/coupons", { code, ...body });
  expect(res.status, JSON.stringify(res.body).slice(0, 200)).toBe(201);
  return code;
}

/** Request the offer with the coupon, approve it, and return the subscription billed. */
async function subscribe(page: Page, planId: string, currency: string, couponCode: string) {
  const request = await apiPost(page, "/api/subscription/request", {
    plan_id: planId,
    billing_cycle: "yearly",
    request_type: "new",
    currency,
    coupon_code: couponCode,
  });
  expect(request.status, JSON.stringify(request.body).slice(0, 200)).toBe(201);

  const approved = await adminPost(
    page,
    `/api/admin/subscription-requests/${request.body.id as string}/approve`
  );
  expect(approved.status).toBe(200);
  return approved.body.subscription as AnyRecord;
}

test.describe("coupons", () => {
  test("a fixed coupon in dinars is checked and billed in dinars", async ({ page }) => {
    const planId = await setup(page);
    const code = await createCoupon(page, {
      discount_type: "fixed",
      discount_value: 50_000,
      currency: "DZD",
    });

    const check = await apiPost(page, "/api/subscription/validate-coupon", {
      code,
      plan_id: planId,
      billing_cycle: "yearly",
      currency: "DZD",
    });
    expect(check.status).toBe(200);
    expect(check.body).toMatchObject({
      valid: true,
      code,
      currency: "DZD",
      discount_value: 50_000,
      discount_amount: 50_000,
      eligible_plan_ids: null,
    });

    const subscription = await subscribe(page, planId, "DZD", code);
    expect(subscription.price_at_purchase).toBe(950_000);
    expect(subscription.discount_amount).toBe(50_000);
    expect(subscription.currency).toBe("DZD");
  });

  test("a fixed coupon in dinars is converted for an offer quoted by rate", async ({ page }) => {
    const planId = await setup(page);
    try {
      // 1 DZD = 0.01 XTS, prices on whole units: 10 000 DZD/year → 100 XTS.
      await setRate(page, 0.01, 100);
      const code = await createCoupon(page, {
        discount_type: "fixed",
        discount_value: 50_000,
        currency: "DZD",
      });

      const check = await apiPost(page, "/api/subscription/validate-coupon", {
        code,
        plan_id: planId,
        billing_cycle: "yearly",
        currency: RATE_CODE,
      });
      // 500 DZD → 5 XTS: the discount, in the currency it is taken from.
      expect(check.body).toMatchObject({
        valid: true,
        currency: RATE_CODE,
        discount_value: 500,
        discount_amount: 500,
      });

      // Billed as quoted — in XTS, by the rate — not in the catalogue's dinars.
      const subscription = await subscribe(page, planId, RATE_CODE, code);
      expect(subscription.currency).toBe(RATE_CODE);
      expect(subscription.price_at_purchase).toBe(9_500);
      expect(subscription.discount_amount).toBe(500);
    } finally {
      await dropRate(page);
    }
  });

  test("a fixed amount the billing currency cannot express is refused", async ({ page }) => {
    const planId = await setup(page);
    const code = await createCoupon(page, {
      discount_type: "fixed",
      discount_value: 10_000,
      currency: "MAD",
    });

    const check = await apiPost(page, "/api/subscription/validate-coupon", {
      code,
      plan_id: planId,
      billing_cycle: "yearly",
      currency: "DZD",
    });
    expect(check.body.valid).toBe(false);

    // And if the code is sent anyway, dirhams are not taken off dinars.
    const subscription = await subscribe(page, planId, "DZD", code);
    expect(subscription.price_at_purchase).toBe(1_000_000);
    expect(subscription.discount_amount).toBe(0);
  });

  test("a percentage is taken off the chosen cycle's price", async ({ page }) => {
    const planId = await setup(page);
    const code = await createCoupon(page, {
      discount_type: "percentage",
      discount_value: 15,
    });

    const check = await apiPost(page, "/api/subscription/validate-coupon", {
      code,
      plan_id: planId,
      billing_cycle: "monthly",
    });
    expect(check.body).toMatchObject({ valid: true, discount_value: 15, discount_amount: 15_000 });
  });
});
