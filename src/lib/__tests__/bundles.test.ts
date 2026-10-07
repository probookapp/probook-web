import { describe, it, expect } from "vitest";
import {
  allocateBundlePrice,
  bundleAvailability,
  bundlePurchasePrice,
  collapseDocumentLines,
  commonTaxRate,
  documentLineTotals,
  expandEditorLines,
  isPresentationLine,
  type BundleComponentSnapshot,
} from "../bundles";
import { calculateDocumentTotals } from "../document-totals";

const comp = (
  product_id: string,
  quantity: number,
  unit_price: number,
  tax_rate = 19
): BundleComponentSnapshot => ({
  product_id,
  variant_id: null,
  description: product_id,
  quantity,
  unit_price,
  tax_rate,
});

const sumShares = (shares: number[], comps: BundleComponentSnapshot[]) =>
  Math.round(shares.reduce((s, u, i) => s + u * comps[i].quantity, 0) * 100) / 100;

describe("allocateBundlePrice", () => {
  it("splits the pack price in proportion to the components' own prices", () => {
    // Camera 20 000, 4 connectors at 500, fitting 8 000: 30 000 alone, sold 24 000.
    const comps = [comp("camera", 1, 20000), comp("connector", 4, 500), comp("fitting", 1, 8000, 9)];
    const shares = allocateBundlePrice(24000, comps, "DZD");
    expect(shares).toEqual([16000, 400, 6400]);
    expect(sumShares(shares, comps)).toBe(24000);
  });

  it("adds up to the pack price to the centime when the split does not fall evenly", () => {
    const comps = [comp("a", 1, 1), comp("b", 1, 1), comp("c", 1, 1)];
    const shares = allocateBundlePrice(100, comps, "EUR");
    expect(sumShares(shares, comps)).toBe(100);
    shares.forEach((s) => expect(Number.isInteger(Math.round(s * 100))).toBe(true));
  });

  it("lands the leftover on a component that comes once per pack", () => {
    const comps = [comp("cable", 3, 100), comp("box", 1, 100)];
    const shares = allocateBundlePrice(333.34, comps, "EUR");
    expect(sumShares(shares, comps)).toBe(333.34);
  });

  it("keeps millimes for a millime currency", () => {
    const comps = [comp("a", 1, 1), comp("b", 2, 1)];
    const shares = allocateBundlePrice(10.001, comps, "TND");
    expect(Math.round(shares.reduce((s, u, i) => s + u * comps[i].quantity, 0) * 1000) / 1000).toBe(10.001);
  });

  it("splits by quantity when every component is free", () => {
    const comps = [comp("a", 1, 0), comp("b", 3, 0)];
    expect(allocateBundlePrice(400, comps, "DZD")).toEqual([100, 100]);
  });

  it("never returns a negative share", () => {
    const comps = [comp("a", 2, 10), comp("b", 2, 10)];
    allocateBundlePrice(0.01, comps, "EUR").forEach((s) => expect(s).toBeGreaterThanOrEqual(0));
  });
});

describe("expandEditorLines / collapseDocumentLines", () => {
  const packLine = {
    product_id: "pack",
    variant_id: null,
    description: "Pack caméra",
    quantity: 2,
    unit_price: 24000,
    tax_rate: 0,
    discount_percent: 10,
    group_name: "Lot 1",
    bundle_components: [comp("camera", 1, 20000), comp("connector", 4, 500), comp("fitting", 1, 8000, 9)],
  };
  const plain = { product_id: "x", description: "Plain", quantity: 1, unit_price: 50, tax_rate: 19 };

  it("turns a pack line into its header followed by its components", () => {
    const lines = expandEditorLines([plain, packLine], { currency: "DZD" });
    expect(lines).toHaveLength(5);
    const [first, header, ...children] = lines;
    expect(first).toMatchObject({ description: "Plain", is_bundle_header: false, bundle_key: null });
    expect(header).toMatchObject({ product_id: "pack", is_bundle_header: true, unit_price: 24000, tax_rate: 0 });
    expect(header).not.toHaveProperty("bundle_components");
    expect(children.map((c) => [c.product_id, c.quantity, c.unit_price, c.tax_rate])).toEqual([
      ["camera", 2, 16000, 19],
      ["connector", 8, 400, 19],
      ["fitting", 2, 6400, 9],
    ]);
    children.forEach((c) => {
      expect(c.bundle_key).toBe(header.bundle_key);
      expect(c).toMatchObject({ is_bundle_header: false, discount_percent: 10, group_name: "Lot 1" });
    });
  });

  it("gives the header the components' rate when they share one", () => {
    const [header] = expandEditorLines(
      [{ ...packLine, bundle_components: [comp("a", 1, 10), comp("b", 1, 10)] }],
      { currency: "DZD" }
    );
    expect(header.tax_rate).toBe(19);
  });

  it("carries quantities only on a delivery note", () => {
    const [header, child] = expandEditorLines([packLine], { priced: false });
    expect(header.unit_price).toBe(24000);
    expect(child).toMatchObject({ quantity: 2, unit_price: 0 });
  });

  it("collapses a saved document back to one line per pack", () => {
    const saved = expandEditorLines([plain, packLine], { currency: "DZD" });
    const lines = collapseDocumentLines(saved);
    expect(lines).toHaveLength(2);
    expect(lines[1].bundle_components).toEqual([
      { product_id: "camera", variant_id: null, description: "camera", quantity: 1, unit_price: 16000, tax_rate: 19, unit: null },
      { product_id: "connector", variant_id: null, description: "connector", quantity: 4, unit_price: 400, tax_rate: 19, unit: null },
      { product_id: "fitting", variant_id: null, description: "fitting", quantity: 1, unit_price: 6400, tax_rate: 9, unit: null },
    ]);
    // Expanding the collapsed lines again reproduces the same document.
    const again = expandEditorLines(lines, { currency: "DZD" });
    expect(again.map((l) => [l.product_id, l.quantity, l.unit_price])).toEqual(
      saved.map((l) => [l.product_id, l.quantity, l.unit_price])
    );
  });

  it("keeps a component whose header is gone as an ordinary line", () => {
    const lines = collapseDocumentLines([
      { product_id: "camera", description: "Caméra", quantity: 1, unit_price: 10, tax_rate: 19, bundle_key: "k" },
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ product_id: "camera", bundle_key: null, is_bundle_header: false });
  });
});

describe("totals of a document carrying a pack", () => {
  const saved = expandEditorLines(
    [
      {
        product_id: "pack",
        description: "Pack",
        quantity: 1,
        unit_price: 24000,
        tax_rate: 0,
        bundle_components: [comp("camera", 1, 20000), comp("connector", 4, 500), comp("fitting", 1, 8000, 9)],
      },
    ],
    { currency: "DZD" }
  ).map((l) => ({ ...l, quantity: Number(l.quantity), unit_price: Number(l.unit_price), tax_rate: Number(l.tax_rate) }));

  it("charges each component's VAT at its own rate and never counts the header", () => {
    const totals = calculateDocumentTotals({ lines: saved, currency: "DZD" });
    expect(totals.linesSubtotal).toBe(24000);
    // 16 000 + 1 600 at 19 %, 6 400 at 9 %.
    expect(totals.taxAmount).toBe(Math.round(17600 * 0.19 + 6400 * 0.09));
  });

  it("values the header at what its components add up to", () => {
    const totals = documentLineTotals(saved, "DZD");
    expect(totals[0].subtotal).toBe(24000);
    expect(totals[0].taxAmount).toBe(totals.slice(1).reduce((s, t) => s + t.taxAmount, 0));
  });

  it("treats a header like a subtotal row wherever value is summed", () => {
    expect(isPresentationLine(saved[0])).toBe(true);
    expect(isPresentationLine(saved[1])).toBe(false);
    expect(isPresentationLine({ is_bundle_header: false })).toBe(false);
    expect(isPresentationLine({ is_subtotal_line: true })).toBe(true);
  });
});

describe("commonTaxRate", () => {
  it("returns the shared rate, or null when the rates differ", () => {
    expect(commonTaxRate([{ tax_rate: 19 }, { tax_rate: 19 }])).toBe(19);
    expect(commonTaxRate([{ tax_rate: 19 }, { tax_rate: 9 }])).toBeNull();
    expect(commonTaxRate([])).toBeNull();
  });
});

describe("bundleAvailability", () => {
  const stock: Record<string, number> = { camera: 5, connector: 9 };
  const onHand = (id: string) => stock[id] ?? 0;

  it("is decided by the scarcest stocked component", () => {
    const comps = [
      { product_id: "camera", variant_id: null, quantity: 1, is_service: false },
      { product_id: "connector", variant_id: null, quantity: 4, is_service: false },
      { product_id: "fitting", variant_id: null, quantity: 1, is_service: true },
    ];
    expect(bundleAvailability(comps, onHand)).toBe(2);
  });

  it("is unlimited for a pack made only of services", () => {
    expect(
      bundleAvailability([{ product_id: "fitting", variant_id: null, quantity: 1, is_service: true }], onHand)
    ).toBeNull();
  });
});

describe("bundlePurchasePrice", () => {
  it("adds up what the components cost", () => {
    expect(bundlePurchasePrice([{ quantity: 1, purchase_price: 12000 }, { quantity: 4, purchase_price: 150 }])).toBe(12600);
  });
});

describe("vatBreakdown", () => {
  it("states each rate's base and tax, adding up to the document's VAT", async () => {
    const { vatBreakdown } = await import("../document-totals");
    const lines = expandEditorLines(
      [
        {
          product_id: "pack",
          description: "Pack",
          quantity: 1,
          unit_price: 24000,
          tax_rate: 0,
          bundle_components: [comp("camera", 1, 20000), comp("connector", 4, 500), comp("fitting", 1, 8000, 9)],
        },
      ],
      { currency: "DZD" }
    ).map((l) => ({ ...l, quantity: Number(l.quantity), unit_price: Number(l.unit_price), tax_rate: Number(l.tax_rate) }));
    const input = { lines, discountPercent: 10, currency: "DZD" };
    const rows = vatBreakdown(input);
    expect(rows.map((r) => r.rate)).toEqual([19, 9]);
    expect(rows[0].base).toBe(15840);
    expect(rows[1].base).toBe(5760);
    const totals = calculateDocumentTotals(input);
    expect(rows.reduce((s, r) => s + r.tax, 0)).toBe(totals.taxAmount);
  });
});
