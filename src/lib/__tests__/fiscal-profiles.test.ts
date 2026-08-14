import { describe, it, expect } from "vitest";
import {
  DEFAULT_FISCAL_PROFILE,
  FISCAL_PROFILES,
  FISCAL_PROFILE_IDS,
  getFiscalProfile,
  identifierFields,
  isFiscalProfileId,
  vatRateOptions,
} from "../fiscal-profiles";

describe("fiscal profiles", () => {
  it("defaults to Algeria — the primary market", () => {
    expect(DEFAULT_FISCAL_PROFILE).toBe("DZ");
    expect(getFiscalProfile(null).id).toBe("DZ");
    expect(getFiscalProfile(undefined).id).toBe("DZ");
    expect(getFiscalProfile("nonsense").id).toBe("DZ");
  });

  it("keeps France fully available", () => {
    const fr = getFiscalProfile("FR");
    expect(fr.id).toBe("FR");
    expect(fr.defaultCurrency).toBe("EUR");
    expect(fr.vatRates).toContain(20);
    expect(fr.vatRates).toContain(5.5);
  });

  it("offers the Algerian VAT scale under DZ", () => {
    expect(FISCAL_PROFILES.DZ.vatRates).toEqual([0, 9, 19]);
    expect(FISCAL_PROFILES.DZ.defaultTaxRate).toBe(19);
    expect(FISCAL_PROFILES.DZ.defaultCurrency).toBe("DZD");
  });

  it("recognises only known profile ids", () => {
    for (const id of FISCAL_PROFILE_IDS) expect(isFiscalProfileId(id)).toBe(true);
    expect(isFiscalProfileId("BE")).toBe(false);
    expect(isFiscalProfileId(19)).toBe(false);
    expect(isFiscalProfileId(null)).toBe(false);
  });

  describe("vatRateOptions", () => {
    it("lists the regime's rates ascending", () => {
      expect(vatRateOptions("DZ").map((o) => o.value)).toEqual(["0", "9", "19"]);
      expect(vatRateOptions("FR").map((o) => o.label)).toEqual([
        "0%",
        "2.1%",
        "5.5%",
        "10%",
        "20%",
      ]);
    });

    it("keeps a record's own rate selectable across regimes", () => {
      // A product created under the French regime must not have its 20% reset
      // just because the tenant switched to Algeria.
      const values = vatRateOptions("DZ", 20).map((o) => o.value);
      expect(values).toEqual(["0", "9", "19", "20"]);
    });

    it("does not duplicate a rate the regime already offers", () => {
      expect(vatRateOptions("DZ", 19).map((o) => o.value)).toEqual(["0", "9", "19"]);
    });

    it("ignores a missing or non-finite current rate", () => {
      expect(vatRateOptions("DZ", null).map((o) => o.value)).toEqual(["0", "9", "19"]);
      expect(vatRateOptions("DZ", NaN).map((o) => o.value)).toEqual(["0", "9", "19"]);
    });
  });

  describe("identifierFields", () => {
    it("shows NIF, RC, NIS and the tax article under DZ", () => {
      expect(identifierFields("DZ").map((f) => f.key)).toEqual([
        "vat_number",
        "siret",
        "nis",
        "art",
      ]);
    });

    it("shows only SIRET and the VAT number under FR", () => {
      expect(identifierFields("FR").map((f) => f.key)).toEqual(["siret", "vat_number"]);
    });

    it("stores both regimes' registration number in the same column", () => {
      // One storage, two vocabularies — a tenant switching regime never loses
      // the value it already captured.
      const dzRc = identifierFields("DZ").find((f) => f.labelKey.endsWith("rc"));
      const frSiret = identifierFields("FR").find((f) => f.labelKey.endsWith("siret"));
      expect(dzRc?.key).toBe("siret");
      expect(frSiret?.key).toBe("siret");
    });
  });
});
