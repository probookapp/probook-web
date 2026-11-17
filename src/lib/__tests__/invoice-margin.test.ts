import { describe, it, expect } from "vitest";
import { invoiceMarginReport, invoiceMarginRow, type InvoiceMarginInput } from "../invoice-margin";

const invoice = (over: Partial<InvoiceMarginInput> = {}): InvoiceMarginInput => ({
  id: "inv-1",
  invoiceNumber: "FAC-001",
  clientId: "c-1",
  clientName: "Client",
  issueDate: "2026-11-01",
  status: "ISSUED",
  subtotal: 1000,
  total: 1190,
  stampDuty: 0,
  lines: [
    { productId: "p-1", quantity: 2, costPriceSnapshot: 200 },
    { productId: "p-2", quantity: 1, costPriceSnapshot: 100 },
  ],
  payments: [],
  creditNotes: [],
  ...over,
});

describe("invoiceMarginRow", () => {
  it("takes the frozen purchase prices off the pre-tax sales", () => {
    const row = invoiceMarginRow(invoice());
    expect(row.revenue).toBe(1000);
    expect(row.cost).toBe(500);
    expect(row.margin).toBe(500);
    expect(row.marginPercent).toBe(50);
  });

  it("skips subtotal rows and pack headers, whose components carry the cost", () => {
    const row = invoiceMarginRow(
      invoice({
        lines: [
          { productId: null, quantity: 1, costPriceSnapshot: 999, isSubtotalLine: true },
          { productId: "pack", quantity: 1, costPriceSnapshot: 999, isBundleHeader: true },
          { productId: "p-1", quantity: 3, costPriceSnapshot: 100 },
        ],
      })
    );
    expect(row.cost).toBe(300);
  });

  it("owes the stamp duty on top of the TTC total, less what was paid", () => {
    const row = invoiceMarginRow(invoice({ stampDuty: 12, payments: [{ amount: 500 }, { amount: 200 }] }));
    expect(row.amountDue).toBe(1202);
    expect(row.paid).toBe(700);
    expect(row.remaining).toBe(502);
  });

  it("treats a PAID invoice as settled even with no payment lines", () => {
    const row = invoiceMarginRow(invoice({ status: "PAID" }));
    expect(row.paid).toBe(1190);
    expect(row.remaining).toBe(0);
  });

  it("never reports an overpayment as a negative balance", () => {
    expect(invoiceMarginRow(invoice({ payments: [{ amount: 1300 }] })).remaining).toBe(0);
  });

  it("nets credit notes off the sales, and the cost of goods that came back", () => {
    const row = invoiceMarginRow(
      invoice({
        creditNotes: [
          { subtotal: 300, restocked: true, lines: [{ productId: "p-1", quantity: 1 }] },
          { subtotal: 100, restocked: false, lines: [{ productId: "p-2", quantity: 1 }] },
        ],
      })
    );
    expect(row.revenue).toBe(600);
    // Only the restocked unit of p-1 (200) comes off; p-2 was not returned to the shelf.
    expect(row.cost).toBe(300);
    expect(row.margin).toBe(300);
  });
});

describe("invoiceMarginReport", () => {
  it("lists the newest invoice first and sums the period's expenses", () => {
    const report = invoiceMarginReport(
      [invoice({ id: "a", issueDate: "2026-10-01" }), invoice({ id: "b", issueDate: "2026-11-05" })],
      [{ amount: 150.5 }, { amount: 49.5 }]
    );
    expect(report.rows.map((r) => r.invoiceId)).toEqual(["b", "a"]);
    expect(report.expensesTotal).toBe(200);
    expect(report.expenseCount).toBe(2);
  });
});
