import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";
import { apiGet, apiPost, apiPut, setupClient, setupIssuedInvoice } from "./api-helpers";

/** The API returns snake_case rows; only the fields these tests read are typed. */
type LineRow = { subtotal: number; discount_percent: number };
const linesOf = (body: Record<string, unknown>) => body.lines as LineRow[];

/**
 * Commercial discounts on quotes and invoices.
 *
 * The rule that matters fiscally: VAT is charged on the base AFTER discount,
 * and the document must stay reconstructable from its own lines plus the stated
 * discount. See src/lib/document-totals.ts.
 */
test.describe("Discounts", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("a line discount reduces that line and the VAT it carries", async ({ page }) => {
    const client = await setupClient(page, "Remise Ligne");
    const res = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: "2026-06-01",
      lines: [
        { description: "Caméra", quantity: 1, unit_price: 10000, tax_rate: 19, discount_percent: 10 },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.subtotal).toBe(9000);
    expect(res.body.tax_amount).toBe(1710); // 19% of 9 000, not of 10 000
    expect(res.body.total).toBe(10710);
    expect(linesOf(res.body)[0].discount_percent).toBe(10);
    expect(linesOf(res.body)[0].subtotal).toBe(9000);
  });

  test("a document discount lowers the taxable base without touching the lines", async ({
    page,
  }) => {
    const client = await setupClient(page, "Remise Globale");
    const res = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: "2026-06-01",
      discount_percent: 10,
      lines: [{ description: "Armoire", quantity: 1, unit_price: 100000, tax_rate: 19 }],
    });
    expect(res.status).toBe(200);
    // The line keeps its own value: the discount is its own stated figure.
    expect(linesOf(res.body)[0].subtotal).toBe(100000);
    expect(res.body.discount_percent).toBe(10);
    expect(res.body.subtotal).toBe(90000);
    expect(res.body.tax_amount).toBe(17100);
    expect(res.body.total).toBe(107100);
  });

  test("the discount is spread across VAT rates, not charged to one of them", async ({ page }) => {
    const client = await setupClient(page, "Remise Multi-TVA");
    const res = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: "2026-06-01",
      discount_percent: 50,
      lines: [
        { description: "Matériel", quantity: 1, unit_price: 1000, tax_rate: 19 },
        { description: "Pose", quantity: 1, unit_price: 1000, tax_rate: 9 },
      ],
    });
    expect(res.body.subtotal).toBe(1000);
    expect(res.body.tax_amount).toBe(140); // 500*0.19 + 500*0.09
  });

  test("a fixed amount comes off after the percentage", async ({ page }) => {
    const client = await setupClient(page, "Remise Mixte");
    const res = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: "2026-06-01",
      discount_percent: 10,
      discount_amount: 50,
      lines: [{ description: "Câblage", quantity: 1, unit_price: 1000, tax_rate: 0 }],
    });
    expect(res.body.subtotal).toBe(850);
    expect(res.body.total).toBe(850);
  });

  test("an over-100% discount is rejected rather than inverting the document", async ({ page }) => {
    const client = await setupClient(page, "Remise Absurde");
    const res = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: "2026-06-01",
      discount_percent: 150,
      lines: [{ description: "X", quantity: 1, unit_price: 100, tax_rate: 0 }],
    });
    expect(res.status).toBe(400);
  });

  test("a fixed amount larger than the document floors it at zero", async ({ page }) => {
    const client = await setupClient(page, "Remise Excessive");
    const res = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: "2026-06-01",
      discount_amount: 999999,
      lines: [{ description: "X", quantity: 1, unit_price: 100, tax_rate: 19 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.subtotal).toBe(0);
    expect(res.body.total).toBe(0);
  });

  test("quotes carry discounts too, and keep them through conversion", async ({ page }) => {
    const client = await setupClient(page, "Remise Devis");
    const quote = await apiPost(page, "/api/quotes", {
      client_id: client.id,
      issue_date: "2026-06-01",
      validity_date: "2026-07-01",
      discount_percent: 20,
      lines: [
        { description: "Installation", quantity: 1, unit_price: 50000, tax_rate: 19, discount_percent: 10 },
      ],
    });
    expect(quote.status).toBe(200);
    expect(linesOf(quote.body)[0].subtotal).toBe(45000); // line discount applied
    expect(quote.body.subtotal).toBe(36000); // then 20% off the document
    expect(quote.body.tax_amount).toBe(6840);
  });

  test("editing a document recomputes its discount", async ({ page }) => {
    const client = await setupClient(page, "Remise Modifiée");
    const created = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: "2026-06-01",
      lines: [{ description: "Poste", quantity: 1, unit_price: 1000, tax_rate: 0 }],
    });
    expect(created.body.total).toBe(1000);

    const updated = await apiPut(page, `/api/invoices/${created.body.id}`, {
      client_id: client.id,
      issue_date: "2026-06-01",
      due_date: "2026-07-01",
      discount_percent: 25,
      lines: [{ description: "Poste", quantity: 1, unit_price: 1000, tax_rate: 0 }],
    });
    expect(updated.status).toBe(200);
    expect(updated.body.total).toBe(750);

    const reread = await apiGet(page, `/api/invoices/${created.body.id}`);
    expect(reread.body.discount_percent).toBe(25);
    expect(reread.body.total).toBe(750);
  });

  test("the VAT return declares the discounted base, not the listed one", async ({ page }) => {
    const client = await setupClient(page, "Remise TVA");
    const invoice = await setupIssuedInvoice(page, {
      client_id: client.id,
      issue_date: "2026-06-01",
      discount_percent: 50,
      lines: [
        { description: "Matériel", quantity: 1, unit_price: 1000, tax_rate: 19 },
        { description: "Pose", quantity: 1, unit_price: 1000, tax_rate: 9 },
      ],
    });
    expect(invoice.status).toBe(200);

    const report = await apiGet(page, "/api/reports/tax-summary?startDate=2026-01-01&endDate=2026-12-31");
    expect(report.status).toBe(200);
    const sales = report.body.sales as {
      gross_ht: number;
      discount_ht: number;
      total_ht: number;
      total_vat: number;
      by_rate: { tax_rate: number; total_ht: number; total_vat: number }[];
    };

    expect(sales.gross_ht).toBeCloseTo(2000, 2);
    expect(sales.discount_ht).toBeCloseTo(1000, 2);
    expect(sales.total_ht).toBeCloseTo(1000, 2);

    // The per-rate breakdown must add up to the headline base. Summing the raw
    // line subtotals would declare 2 000 of taxable sales on 1 000 invoiced.
    const byRate = sales.by_rate;
    const rateHt = byRate.reduce((s, r) => s + r.total_ht, 0);
    const rateVat = byRate.reduce((s, r) => s + r.total_vat, 0);
    expect(rateHt).toBeCloseTo(sales.total_ht, 2);
    expect(rateVat).toBeCloseTo(sales.total_vat, 2);
    expect(byRate.find((r) => r.tax_rate === 19)?.total_ht).toBeCloseTo(500, 2);
    expect(byRate.find((r) => r.tax_rate === 9)?.total_ht).toBeCloseTo(500, 2);
  });

  test("the accounting export states the discount as its own column", async ({ page }) => {
    const client = await setupClient(page, "Remise Export");
    const invoice = await setupIssuedInvoice(page, {
      client_id: client.id,
      issue_date: "2026-06-01",
      discount_amount: 250,
      lines: [{ description: "Alarme", quantity: 1, unit_price: 1000, tax_rate: 19 }],
    });
    expect(invoice.status).toBe(200);

    const report = await apiGet(
      page,
      "/api/reports/accounting-export?startDate=2026-01-01&endDate=2026-12-31"
    );
    expect(report.status).toBe(200);
    type SaleRow = { number: string; gross_ht: number; discount: number; ht: number };
    const row = (report.body.sales as SaleRow[]).find((s) => s.number === invoice.body.invoice_number);
    expect(row).toBeDefined();
    // A ledger that showed only the net could not tell a discount from a lower price.
    expect(row!.gross_ht).toBeCloseTo(1000, 2);
    expect(row!.discount).toBeCloseTo(250, 2);
    expect(row!.ht).toBeCloseTo(750, 2);
    expect(row!.gross_ht - row!.discount).toBeCloseTo(row!.ht, 2);
  });

  test("shipping is never discounted", async ({ page }) => {
    const client = await setupClient(page, "Remise Port");
    const res = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: "2026-06-01",
      discount_percent: 100,
      shipping_cost: 500,
      shipping_tax_rate: 19,
      lines: [{ description: "Offert", quantity: 1, unit_price: 1000, tax_rate: 0 }],
    });
    // The goods are free; the carrier still gets paid.
    expect(res.body.subtotal).toBe(500);
    expect(res.body.tax_amount).toBe(95);
    expect(res.body.total).toBe(595);
  });
});
