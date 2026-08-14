import { describe, it, expect } from "vitest";
import {
  calculateLineTotals,
  calculateDocumentTotals,
  resolveDocumentDiscount,
} from "../document-totals";

const line = (
  quantity: number,
  unit_price: number,
  tax_rate: number,
  discount_percent = 0
) => ({ quantity, unit_price, tax_rate, discount_percent });

describe("calculateLineTotals", () => {
  it("prices a plain line", () => {
    expect(calculateLineTotals(line(3, 42000, 19))).toEqual({
      subtotal: 126000,
      taxAmount: 23940,
      total: 149940,
      discount: 0,
    });
  });

  it("takes the line discount off the pre-tax base, then taxes the remainder", () => {
    // Taxing the undiscounted base would overcharge the customer's VAT.
    const t = calculateLineTotals(line(1, 10000, 19, 10));
    expect(t.discount).toBe(1000);
    expect(t.subtotal).toBe(9000);
    expect(t.taxAmount).toBe(1710);
    expect(t.total).toBe(10710);
  });

  it("ignores a nonsensical discount instead of inverting the line", () => {
    expect(calculateLineTotals(line(1, 100, 19, -50)).subtotal).toBe(100);
    expect(calculateLineTotals(line(1, 100, 19, 500)).subtotal).toBe(0);
    expect(calculateLineTotals({ quantity: 1, unit_price: 100, tax_rate: 19 }).subtotal).toBe(100);
  });
});

describe("calculateDocumentTotals", () => {
  it("sums lines and keeps total = base + tax", () => {
    const t = calculateDocumentTotals({ lines: [line(2, 100, 19), line(1, 50, 9)] });
    expect(t.linesSubtotal).toBe(250);
    expect(t.subtotal).toBe(250);
    expect(t.taxAmount).toBe(42.5); // 200*.19 + 50*.09
    expect(t.total).toBe(292.5);
  });

  it("skips presentation-only subtotal rows", () => {
    const t = calculateDocumentTotals({
      lines: [line(1, 100, 19), { ...line(1, 999, 19), is_subtotal_line: true }],
    });
    expect(t.linesSubtotal).toBe(100);
  });

  it("keeps the document discount out of the lines and off the taxable base", () => {
    const t = calculateDocumentTotals({ lines: [line(1, 100000, 19)], discountPercent: 10 });
    expect(t.linesSubtotal).toBe(100000); // the "sous-total" row is untouched
    expect(t.documentDiscount).toBe(10000);
    expect(t.subtotal).toBe(90000); // taxable base
    expect(t.taxAmount).toBe(17100); // 19% of the DISCOUNTED base
    expect(t.total).toBe(107100);
  });

  it("applies the percentage first, then the fixed amount", () => {
    const t = calculateDocumentTotals({
      lines: [line(1, 1000, 0)],
      discountPercent: 10,
      discountAmount: 50,
    });
    expect(t.documentDiscount).toBe(150);
    expect(t.subtotal).toBe(850);
  });

  it("never lets a discount push the base negative", () => {
    const t = calculateDocumentTotals({
      lines: [line(1, 100, 19)],
      discountAmount: 100000,
    });
    expect(t.documentDiscount).toBe(100);
    expect(t.subtotal).toBe(0);
    expect(t.taxAmount).toBe(0);
    expect(t.total).toBe(0);
  });

  it("spreads the discount across VAT rates in proportion, not onto one of them", () => {
    // 1000 at 19% and 1000 at 9%, 50% off: each base halves, each rate keeps its
    // own correct taxable amount.
    const t = calculateDocumentTotals({
      lines: [line(1, 1000, 19), line(1, 1000, 9)],
      discountPercent: 50,
    });
    expect(t.subtotal).toBe(1000);
    expect(t.taxAmount).toBe(140); // 500*.19 + 500*.09
    expect(t.total).toBe(1140);
  });

  it("adds shipping to the base and never discounts it", () => {
    const t = calculateDocumentTotals({
      lines: [line(1, 1000, 0)],
      shippingCost: 500,
      shippingTaxRate: 19,
      discountPercent: 100,
    });
    // The goods are free; the carrier still has to be paid.
    expect(t.documentDiscount).toBe(1000);
    expect(t.subtotal).toBe(500);
    expect(t.taxAmount).toBe(95);
    expect(t.total).toBe(595);
  });

  it("combines line and document discounts", () => {
    const t = calculateDocumentTotals({
      lines: [line(1, 1000, 19, 10)], // -> 900
      discountPercent: 10, // -> 810
    });
    expect(t.linesSubtotal).toBe(900);
    expect(t.documentDiscount).toBe(90);
    expect(t.subtotal).toBe(810);
    expect(t.taxAmount).toBe(153.9);
  });

  it("is stable on an empty document", () => {
    const t = calculateDocumentTotals({ lines: [], discountPercent: 20 });
    expect(t).toEqual({
      subtotal: 0,
      taxAmount: 0,
      total: 0,
      linesSubtotal: 0,
      documentDiscount: 0,
    });
  });

  it("rounds to the centime for a two-decimal currency", () => {
    const t = calculateDocumentTotals({ lines: [line(3, 33.333, 19)], currency: "DZD" });
    expect(t.subtotal).toBe(100);
    expect(t.total).toBe(t.subtotal + t.taxAmount);
  });

  it("keeps the millime for a currency that has one", () => {
    // The dinar tunisien is denominated in millimes; rounding it to the centime
    // charged a different amount from the one displayed.
    const t = calculateDocumentTotals({ lines: [line(3, 33.333, 0)], currency: "TND" });
    expect(t.subtotal).toBe(99.999);

    const dz = calculateDocumentTotals({ lines: [line(3, 33.333, 0)], currency: "DZD" });
    expect(dz.subtotal).toBe(100);
  });

  it("defaults to two decimals when no currency is given", () => {
    expect(calculateDocumentTotals({ lines: [line(3, 33.333, 0)] }).subtotal).toBe(100);
  });
});

describe("resolveDocumentDiscount", () => {
  it("gives reporting code the same figure the document was priced with", () => {
    // The VAT return re-derives the discount from a stored invoice; if it drifted
    // from calculateDocumentTotals, the declared base would not match the invoice.
    const lines = [line(1, 1000, 19), line(1, 1000, 9)];
    const totals = calculateDocumentTotals({ lines, discountPercent: 30, discountAmount: 100 });
    const resolved = resolveDocumentDiscount(totals.linesSubtotal, 30, 100);
    expect(resolved.amount).toBe(totals.documentDiscount);
    expect(totals.linesSubtotal * resolved.keptRatio).toBeCloseTo(totals.subtotal, 6);
  });

  it("keeps everything when there is no discount", () => {
    expect(resolveDocumentDiscount(1000)).toEqual({ amount: 0, keptRatio: 1 });
  });

  it("caps at the base and reports a ratio of zero rather than a negative one", () => {
    expect(resolveDocumentDiscount(500, 0, 9999)).toEqual({ amount: 500, keptRatio: 0 });
  });

  it("does not divide by zero on a document with no lines", () => {
    expect(resolveDocumentDiscount(0, 50, 100)).toEqual({ amount: 0, keptRatio: 1 });
  });

  it("rounds the percentage in the document's own currency", () => {
    expect(resolveDocumentDiscount(100, 33.333, 0, "DZD").amount).toBe(33.33);
    expect(resolveDocumentDiscount(100, 33.333, 0, "TND").amount).toBe(33.333);
  });
});
