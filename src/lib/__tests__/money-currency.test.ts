import { describe, it, expect } from "vitest";
import { currencyMinorUnits, roundMoney, roundToUnits, MAX_MINOR_UNITS } from "../money";

describe("currencyMinorUnits", () => {
  it("gives two decimals to the currencies the app sells in", () => {
    for (const c of ["DZD", "MAD", "EUR", "USD", "GBP", "CAD", "CHF"]) {
      expect(currencyMinorUnits(c)).toBe(2);
    }
  });

  it("gives three to millime currencies", () => {
    // The dinar tunisien is the one offered in the settings picker.
    expect(currencyMinorUnits("TND")).toBe(3);
    for (const c of ["LYD", "BHD", "KWD", "OMR", "JOD", "IQD"]) {
      expect(currencyMinorUnits(c)).toBe(3);
    }
  });

  it("is case-insensitive", () => {
    expect(currencyMinorUnits("tnd")).toBe(3);
  });

  it("falls back to two decimals rather than throwing", () => {
    expect(currencyMinorUnits(null)).toBe(2);
    expect(currencyMinorUnits(undefined)).toBe(2);
    expect(currencyMinorUnits("")).toBe(2);
    expect(currencyMinorUnits("NOTACURRENCY")).toBe(2);
  });

  it("never exceeds what the columns can store", () => {
    // NUMERIC(16,3): a zero-decimal or four-decimal currency must not widen it.
    expect(currencyMinorUnits("JPY")).toBeLessThanOrEqual(MAX_MINOR_UNITS);
    expect(currencyMinorUnits("CLF")).toBeLessThanOrEqual(MAX_MINOR_UNITS);
  });
});

describe("roundMoney", () => {
  it("keeps the millime in dinars tunisiens and drops it in dinars algériens", () => {
    expect(roundMoney(12.345, "TND")).toBe(12.345);
    expect(roundMoney(12.345, "DZD")).toBe(12.35);
  });

  it("handles non-finite input without producing NaN totals", () => {
    expect(roundToUnits(Number.NaN, 2)).toBe(0);
    expect(roundToUnits(Number.POSITIVE_INFINITY, 2)).toBe(0);
  });

  it("clamps a nonsensical precision", () => {
    expect(roundToUnits(1.23456, 99)).toBe(1.235);
    expect(roundToUnits(1.5, -3)).toBe(2);
  });
});
