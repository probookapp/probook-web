import { describe, it, expect } from "vitest";
import {
  quote,
  bundleThatBeats,
  DEFAULT_BASIS,
  type ModuleOption,
  type BundleOption,
} from "../alacarte";

const MODULES: ModuleOption[] = [
  { key: "pos", name: "Caisse", unitPrice: 70_000 },
  { key: "purchasing", name: "Achats", unitPrice: 70_000 },
  { key: "delivery_notes", name: "Livraisons", unitPrice: 70_000 },
  { key: "expenses", name: "Dépenses", unitPrice: 70_000 },
  { key: "import_export", name: "Import/export", unitPrice: 70_000 },
  { key: "multi_location", name: "Multi-sites", unitPrice: 140_000 },
  { key: "advanced_reports", name: "Rapports avancés", unitPrice: 140_000 },
  { key: "unpriced_thing", name: "Non tarifé", unitPrice: null },
];

const BUNDLES: BundleOption[] = [
  { id: "1", slug: "essential", name: "Essential", monthlyPrice: 190_000, yearlyPrice: 1_900_000, moduleKeys: [], seats: 1 },
  {
    id: "2",
    slug: "commerce",
    name: "Commerce",
    monthlyPrice: 390_000,
    yearlyPrice: 3_900_000,
    moduleKeys: ["pos", "purchasing", "delivery_notes", "expenses", "import_export"],
    seats: 3,
  },
  {
    id: "3",
    slug: "enterprise",
    name: "Enterprise",
    monthlyPrice: 790_000,
    yearlyPrice: 7_900_000,
    moduleKeys: [
      "pos", "purchasing", "delivery_notes", "expenses", "import_export",
      "multi_location", "advanced_reports",
    ],
    seats: null,
  },
];

describe("what a composed subscription costs", () => {
  it("charges the base alone when nothing is added", () => {
    const q = quote({ moduleKeys: [], seats: 1 }, MODULES);
    expect(q.monthly).toBe(190_000);
    // Ten months for twelve: the same discount the bundles advertise.
    expect(q.yearly).toBe(1_900_000);
  });

  it("puts the tipping point at three modules, which is the whole calibration", () => {
    const one = quote({ moduleKeys: ["pos"], seats: 1 }, MODULES).monthly;
    const two = quote({ moduleKeys: ["pos", "purchasing"], seats: 1 }, MODULES).monthly;
    const three = quote(
      { moduleKeys: ["pos", "purchasing", "expenses"], seats: 1 },
      MODULES
    ).monthly;

    const commerce = 390_000;
    expect(one).toBeLessThan(commerce);
    expect(two).toBeLessThan(commerce);
    // At three the bundle wins, so composing past it stops paying — which is
    // what keeps the offers meaningful without a banner saying so.
    expect(three).toBeGreaterThan(commerce);
  });

  it("keeps multi-site cheaper alone than the offer that carries it", () => {
    const q = quote({ moduleKeys: ["multi_location"], seats: 1 }, MODULES);
    expect(q.monthly).toBe(330_000);
    expect(q.monthly).toBeLessThan(790_000);
  });

  it("charges seats above the first and reports the breakdown", () => {
    const q = quote({ moduleKeys: ["pos"], seats: 3 }, MODULES);
    expect(q.seats).toBe(2 * DEFAULT_BASIS.seatUnitPrice);
    expect(q.monthly).toBe(190_000 + 70_000 + 60_000);
  });

  it("never gives an unpriced module away", () => {
    const q = quote({ moduleKeys: ["pos", "unpriced_thing"], seats: 1 }, MODULES);
    expect(q.unpriced).toEqual(["unpriced_thing"]);
    // Charged for what it could price, and the caller is told about the rest
    // rather than the customer discovering it on the invoice.
    expect(q.modules).toBe(70_000);
  });

  it("treats a module the catalogue does not know as unpriced, not free", () => {
    const q = quote({ moduleKeys: ["invented"], seats: 1 }, MODULES);
    expect(q.unpriced).toEqual(["invented"]);
  });
});

describe("the honest comparison line", () => {
  it("names a bundle that covers the same choice for less", () => {
    const composition = {
      moduleKeys: ["pos", "purchasing", "expenses"],
      seats: 1,
    };
    const total = quote(composition, MODULES).monthly;
    expect(bundleThatBeats(composition, BUNDLES, total)?.slug).toBe("commerce");
  });

  it("says nothing when composing is the cheaper answer", () => {
    const composition = { moduleKeys: ["pos"], seats: 1 };
    const total = quote(composition, MODULES).monthly;
    // No banner arguing against the offers on the page that sells them.
    expect(bundleThatBeats(composition, BUNDLES, total)).toBeNull();
  });

  it("ignores a cheaper bundle that would not cover the seats", () => {
    const composition = { moduleKeys: ["pos", "purchasing", "expenses"], seats: 8 };
    const total = quote(composition, MODULES).monthly;
    // Commerce is cheaper but covers three people; recommending it would be
    // true about the price and wrong about the business.
    expect(bundleThatBeats(composition, BUNDLES, total)?.slug).not.toBe("commerce");
  });

  it("counts a bundle that throws in an extra module as still beating it", () => {
    const composition = { moduleKeys: ["multi_location", "advanced_reports"], seats: 1 };
    const total = quote(composition, MODULES).monthly;
    expect(total).toBe(190_000 + 280_000);
    // 4 700 composed against Enterprise at 7 900: composing still wins here.
    expect(bundleThatBeats(composition, BUNDLES, total)).toBeNull();
  });

  it("prefers the cheapest bundle when several would do", () => {
    const composition = { moduleKeys: ["pos", "purchasing", "delivery_notes", "expenses"], seats: 1 };
    const total = quote(composition, MODULES).monthly;
    expect(bundleThatBeats(composition, BUNDLES, total)?.slug).toBe("commerce");
  });
});
