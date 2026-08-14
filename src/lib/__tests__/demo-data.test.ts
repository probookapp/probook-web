import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  DEMO_ACCOUNTING_EXPORT,
  DEMO_CLIENTS,
  DEMO_DASHBOARD_STATS,
  DEMO_EXPENSES,
  DEMO_EXPENSES_BY_CATEGORY,
  DEMO_EXPENSES_BY_MONTH,
  DEMO_INVENTORY_VALUATION,
  DEMO_INVOICES,
  DEMO_PIPELINE,
  DEMO_POS_DAILY,
  DEMO_PRODUCTS,
  DEMO_PROFIT_MARGIN,
  DEMO_QUOTES,
  DEMO_QUOTE_CONVERSION,
  DEMO_SUPPLIER_SPEND,
  DEMO_TAX_SUMMARY,
} from "../demo-data";

/**
 * Demo mode is the shop window: a prospect clicking a report tab and finding a
 * blank page concludes the feature does not exist. Six tabs used to do exactly
 * that, so these tests guard the two properties that matter — nothing is empty,
 * and every summary agrees with the list it summarises.
 */
describe("demo reports are not empty", () => {
  const datasets: [string, { length: number } | object][] = [
    ["profit margin", DEMO_PROFIT_MARGIN],
    ["supplier spend", DEMO_SUPPLIER_SPEND],
    ["inventory valuation", DEMO_INVENTORY_VALUATION],
    ["expenses by month", DEMO_EXPENSES_BY_MONTH],
    ["expenses by category", DEMO_EXPENSES_BY_CATEGORY.categories],
    ["tax summary rates", DEMO_TAX_SUMMARY.sales.by_rate],
    ["accounting journal", DEMO_ACCOUNTING_EXPORT.journal],
    ["pipeline quotes", DEMO_PIPELINE.quotes],
  ];

  for (const [name, data] of datasets) {
    it(`has rows for ${name}`, () => {
      expect(Array.isArray(data) ? data.length : 0).toBeGreaterThan(0);
    });
  }

  it("has a counter day to show", () => {
    expect(DEMO_POS_DAILY.transaction_count).toBeGreaterThan(0);
    expect(DEMO_POS_DAILY.sales_by_method.length).toBeGreaterThan(0);
  });
});

describe("demo summaries agree with the demo lists", () => {
  it("breaks expenses down to the same total", () => {
    const listed = DEMO_EXPENSES.reduce((s, e) => s + e.amount, 0);
    expect(DEMO_EXPENSES_BY_CATEGORY.total).toBeCloseTo(listed, 2);
    const bucketed = DEMO_EXPENSES_BY_CATEGORY.categories.reduce((s, c) => s + c.total_amount, 0);
    expect(bucketed).toBeCloseTo(listed, 2);
  });

  it("keeps an unfiled bucket so the parts add up to the whole", () => {
    const unfiled = DEMO_EXPENSES_BY_CATEGORY.categories.find((c) => c.category_id === null);
    expect(unfiled).toBeDefined();
  });

  it("counts quotes the way the quote list does", () => {
    expect(DEMO_QUOTE_CONVERSION.total_quotes).toBe(DEMO_QUOTES.length);
    const accepted = DEMO_QUOTES.filter((q) => q.status === "ACCEPTED");
    expect(DEMO_QUOTE_CONVERSION.converted_quotes).toBe(accepted.length);
    expect(DEMO_QUOTE_CONVERSION.converted_amount).toBeCloseTo(
      accepted.reduce((s, q) => s + q.total, 0),
      2
    );
  });

  it("declares the same sales as the non-draft invoices", () => {
    const billed = DEMO_INVOICES.filter((i) => i.status !== "DRAFT");
    expect(DEMO_TAX_SUMMARY.sales.invoice_count).toBe(billed.length);
    expect(DEMO_TAX_SUMMARY.sales.total_ttc).toBeCloseTo(
      billed.reduce((s, i) => s + i.total, 0),
      2
    );
  });

  it("keeps the dashboard figures in step with the lists behind them", () => {
    // These used to be hand-maintained and had already drifted.
    expect(DEMO_DASHBOARD_STATS.total_clients).toBe(DEMO_CLIENTS.length);
    expect(DEMO_DASHBOARD_STATS.total_invoices).toBe(DEMO_INVOICES.length);
    expect(DEMO_DASHBOARD_STATS.total_quotes).toBe(DEMO_QUOTES.length);
    expect(DEMO_DASHBOARD_STATS.total_expenses).toBeCloseTo(
      DEMO_EXPENSES.reduce((s, e) => s + e.amount, 0),
      2
    );
    expect(DEMO_DASHBOARD_STATS.profit).toBeCloseTo(
      DEMO_DASHBOARD_STATS.revenue_this_year - DEMO_DASHBOARD_STATS.total_expenses,
      2
    );
  });
  it("values only the stock that exists", () => {
    for (const row of DEMO_INVENTORY_VALUATION) {
      const product = DEMO_PRODUCTS.find((p) => p.id === row.product_id);
      expect(product?.is_service).toBe(false);
      expect(row.stock_value).toBeCloseTo(row.quantity * row.purchase_price, 2);
    }
  });

  it("gives services a cost, so the margin block has something to show", () => {
    // Without a cost the live margin in the quote and invoice forms never
    // appears, and a prospect cannot see the feature at all.
    const services = DEMO_PRODUCTS.filter((p) => p.is_service);
    expect(services.length).toBeGreaterThan(0);
    for (const service of services) {
      expect(service.purchase_price ?? 0).toBeGreaterThan(0);
    }
  });

  it("shows a commercial discount somewhere", () => {
    const discounted = DEMO_QUOTES.filter((q) => (q.discount_percent ?? 0) > 0);
    expect(discounted.length).toBeGreaterThan(0);
    for (const quote of discounted) {
      const lines = quote.lines.reduce((s, l) => s + (l.is_subtotal_line ? 0 : l.subtotal), 0);
      // The stated discount has to reconcile: lines − discount = taxable base.
      const expected = lines * (1 - (quote.discount_percent ?? 0) / 100);
      expect(quote.subtotal).toBeCloseTo(expected, 2);
    }
  });
});

describe("demo data reads in the product's language", () => {
  it("has no leftover English labels", () => {
    // The demo is French-first (the default locale and the target market). A
    // stray "Monthly Maintenance" in a screenshot is the kind of thing a
    // prospect notices before anything else.
    const dir = path.join(process.cwd(), "src/lib/demo-data");
    const english =
      /\b(Monthly|Package|Development|Design|Office Chair|Consulting|Hourly|Maintenance Contract|Printer Paper|Laptop Stand|Waiting for|due in|expires in|Silver|Rose Gold)\b/;

    const offenders: string[] = [];
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith(".ts")) continue;
      const source = fs.readFileSync(path.join(dir, file), "utf8");
      for (const [, literal] of source.matchAll(/"([^"\\]{4,80})"/g)) {
        if (english.test(literal)) offenders.push(`${file}: ${literal}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
