import { describe, it, expect } from "vitest";
import { couponDiscount, couponValueIn, quoteCatalogue, resolvePlanPrice } from "../plan-pricing";

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

describe("quoteCatalogue", () => {
  const commerceTypedInEuros = {
    ...essential,
    monthlyPrice: 390_000,
    yearlyPrice: 3_900_000,
    prices: [{ currency: "EUR", monthlyPrice: 2_900, yearlyPrice: 29_000 }],
  };

  it("quotes every offer in the currency when each can be", () => {
    const q = quoteCatalogue([essential, commerceTypedInEuros], "EUR", EUR);
    expect(q.currency).toBe("EUR");
    expect(q.prices.map((p) => p.currency)).toEqual(["EUR", "EUR"]);
    // Commerce keeps the price typed for it; Essentiel goes by the rate.
    expect(q.prices.map((p) => p.via)).toEqual(["rate", "row"]);
  });

  it("falls back to the catalogue for every offer when one cannot be quoted", () => {
    // Commerce has euros typed, Essentiel has nothing and there is no rate:
    // the page used to show one card in euros beside one in dinars.
    const q = quoteCatalogue([essential, commerceTypedInEuros], "EUR", null);
    expect(q.currency).toBe("DZD");
    expect(q.prices.map((p) => p.currency)).toEqual(["DZD", "DZD"]);
    expect(q.prices[1].monthly).toBe(390_000);
  });

  it("prices modules and seats by the rate, and only by the rate", () => {
    expect(quoteCatalogue([essential], "EUR", EUR).convert(70_000)).toBe(500);
    expect(quoteCatalogue([essential], null, null).convert(70_000)).toBe(70_000);
    // Every offer typed in euros but no rate: a typed offer price says nothing
    // about what a module costs, so there is no figure to show.
    const allTyped = [commerceTypedInEuros, { ...commerceTypedInEuros }];
    const typedOnly = quoteCatalogue(allTyped, "EUR", null);
    expect(typedOnly.currency).toBe("EUR");
    expect(typedOnly.convert(70_000)).toBeNull();
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
