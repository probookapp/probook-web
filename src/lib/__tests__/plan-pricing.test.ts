import { describe, it, expect } from "vitest";
import { couponDiscount, couponValueIn, resolvePlanPrice } from "../plan-pricing";

const EUR = { code: "EUR", perDzd: 0.0069, roundTo: 100 };

const essential = {
  monthlyPrice: 190_000,
  yearlyPrice: 1_900_000,
  currency: "DZD",
  prices: [] as { currency: string; monthlyPrice: number; yearlyPrice: number }[],
};

describe("resolvePlanPrice", () => {
  it("keeps the catalogue when no currency is asked for", () => {
    expect(resolvePlanPrice(essential, null, null)).toEqual({
      monthly: 190_000,
      yearly: 1_900_000,
      currency: "DZD",
      via: "catalogue",
    });
  });

  it("prefers a price typed by hand over the rate", () => {
    const typed = { ...essential, prices: [{ currency: "EUR", monthlyPrice: 1_500, yearlyPrice: 15_000 }] };
    expect(resolvePlanPrice(typed, "EUR", EUR)).toMatchObject({ yearly: 15_000, currency: "EUR", via: "row" });
  });

  it("converts by the rate when nothing was typed", () => {
    // 19 000 DZD × 0.0069 = 131.10 EUR, rounded up to the euro.
    expect(resolvePlanPrice(essential, "EUR", EUR)).toMatchObject({ yearly: 13_200, currency: "EUR", via: "rate" });
  });

  it("keeps the catalogue when the currency has neither a row nor a rate", () => {
    expect(resolvePlanPrice(essential, "MAD", null)).toMatchObject({ currency: "DZD", via: "catalogue" });
  });

  it("never converts an offer that is not written in the reference currency", () => {
    const composedInEuros = { ...essential, currency: "EUR", yearlyPrice: 20_000 };
    expect(resolvePlanPrice(composedInEuros, "EUR", EUR)).toMatchObject({ yearly: 20_000, via: "catalogue" });
  });
});

describe("couponDiscount", () => {
  const percent = { discountType: "percentage", discountValue: 20, currency: "DZD" };
  const fixedDzd = { discountType: "fixed", discountValue: 500_000, currency: "DZD" };
  const fixedMad = { discountType: "fixed", discountValue: 10_000, currency: "MAD" };

  it("takes a percentage in any currency, rounded down", () => {
    expect(couponDiscount(percent, 13_255, "EUR", null)).toBe(2_651);
  });

  it("takes a fixed amount as is in its own currency", () => {
    expect(couponDiscount(fixedDzd, 1_900_000, "DZD", null)).toBe(500_000);
  });

  it("converts dinars by the rate, rounding the discount down", () => {
    // 5 000 DZD × 0.0069 = 34.50 EUR, rounded down to the euro.
    expect(couponValueIn(fixedDzd, "EUR", EUR)).toBe(3_400);
    expect(couponDiscount(fixedDzd, 13_200, "EUR", EUR)).toBe(3_400);
  });

  it("refuses a fixed amount the billing currency cannot express", () => {
    expect(couponDiscount(fixedDzd, 13_200, "EUR", null)).toBeNull();
    expect(couponDiscount(fixedMad, 13_200, "EUR", EUR)).toBeNull();
  });

  it("never takes off more than the price", () => {
    expect(couponDiscount(fixedDzd, 190_000, "DZD", null)).toBe(190_000);
  });
});
