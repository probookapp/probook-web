import { describe, it, expect } from "vitest";
import { computeTimbreScale, computeStampDuty } from "@/lib/stamp-duty";

describe("computeTimbreScale (Algerian progressive droit de timbre)", () => {
  it("exempts amounts up to 300 DA", () => {
    expect(computeTimbreScale(0)).toBe(0);
    expect(computeTimbreScale(300)).toBe(0);
  });

  it("enforces the 5 DA minimum just above the exemption", () => {
    // 350 → bracket 1: ceil(350/100)=4 → 4 DA, floored to the 5 DA minimum.
    expect(computeTimbreScale(350)).toBe(5);
  });

  it("bracket 1 (301–30 000) is 1% per started 100 DA", () => {
    expect(computeTimbreScale(1000)).toBe(10); // ceil(10)*1
    expect(computeTimbreScale(30000)).toBe(300); // ceil(300)*1
  });

  it("bracket 2 (30 001–100 000) is 1.5%", () => {
    expect(computeTimbreScale(50000)).toBe(750); // 500 * 1.5
    expect(computeTimbreScale(100000)).toBe(1500); // 1000 * 1.5
  });

  it("bracket 3 (> 100 000) is 2%, no maximum", () => {
    expect(computeTimbreScale(200000)).toBe(4000); // 2000 * 2
    expect(computeTimbreScale(1000000)).toBe(20000);
  });

  it("charges per STARTED 100 DA fraction", () => {
    expect(computeTimbreScale(1050)).toBe(11); // ceil(10.5)=11
  });
});

describe("computeStampDuty gates", () => {
  const base = { enabled: true, isCashSale: true, total: 1000 };
  it("applies for an enabled cash sale", () => {
    expect(computeStampDuty(base)).toBe(10);
  });
  it("is zero for drafts, disabled, non-cash, or exempt", () => {
    expect(computeStampDuty({ ...base, isDraft: true })).toBe(0);
    expect(computeStampDuty({ ...base, enabled: false })).toBe(0);
    expect(computeStampDuty({ ...base, isCashSale: false })).toBe(0);
    expect(computeStampDuty({ ...base, exempt: true })).toBe(0);
  });
  it("respects an optional business floor", () => {
    expect(computeStampDuty({ ...base, threshold: 5000 })).toBe(0);
  });
});
