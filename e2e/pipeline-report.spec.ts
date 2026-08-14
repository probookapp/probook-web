import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";
import { apiGet, apiPost, setupClient, setupIssuedInvoice } from "./api-helpers";

/**
 * The steering report: how many documents sit in each state, and what is still
 * moving — accepted-but-not-invoiced, invoiced-but-not-paid.
 */
type Bucket = { status: string; count: number; total: number };
type Pipeline = {
  quotes: Bucket[];
  invoices: Bucket[];
  delivery_notes: Bucket[];
  in_progress: {
    awaiting_invoice: { number: string; amount: number }[];
    awaiting_invoice_total: number;
    awaiting_payment: { number: string; remaining: number; overdue: boolean }[];
    awaiting_payment_total: number;
    overdue_count: number;
    overdue_total: number;
  };
};

const RANGE = "?startDate=2026-01-01&endDate=2026-12-31";

test.describe("Pipeline report", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("every known state is reported, including the empty ones", async ({ page }) => {
    // "0 unpaid" is an answer; a missing row is not.
    const res = await apiGet(page, `/api/reports/pipeline${RANGE}`);
    expect(res.status).toBe(200);
    const report = res.body as unknown as Pipeline;

    expect(report.quotes.map((b) => b.status)).toEqual(["DRAFT", "SENT", "ACCEPTED", "EXPIRED"]);
    expect(report.invoices.map((b) => b.status)).toEqual(["DRAFT", "ISSUED", "PAID"]);
    expect(report.delivery_notes.map((b) => b.status)).toEqual(["DRAFT", "DELIVERED", "CANCELLED"]);
    expect(report.quotes.every((b) => b.count === 0)).toBe(true);
  });

  test("counts and amounts follow the documents", async ({ page }) => {
    const client = await setupClient(page, "Pilotage SARL");
    const line = [{ description: "Prestation", quantity: 1, unit_price: 10000, tax_rate: 0 }];
    await apiPost(page, "/api/quotes", {
      client_id: client.id,
      issue_date: "2026-06-01",
      validity_date: "2026-07-01",
      status: "SENT",
      lines: line,
    });
    await setupIssuedInvoice(page, {
      client_id: client.id,
      issue_date: "2026-06-02",
      lines: line,
    });

    const report = (await apiGet(page, `/api/reports/pipeline${RANGE}`)).body as unknown as Pipeline;
    const sent = report.quotes.find((b) => b.status === "SENT")!;
    expect(sent.count).toBe(1);
    expect(sent.total).toBeCloseTo(10000, 2);

    const issued = report.invoices.find((b) => b.status === "ISSUED")!;
    expect(issued.count).toBe(1);
    expect(issued.total).toBeCloseTo(10000, 2);
  });

  test("an accepted quote counts as work won but not yet billed", async ({ page }) => {
    const client = await setupClient(page, "Affaire En Cours");
    const quote = await apiPost(page, "/api/quotes", {
      client_id: client.id,
      issue_date: "2026-06-01",
      validity_date: "2026-07-01",
      status: "ACCEPTED",
      lines: [{ description: "Chantier", quantity: 1, unit_price: 50000, tax_rate: 0 }],
    });
    expect(quote.status).toBe(200);

    const before = (await apiGet(page, `/api/reports/pipeline${RANGE}`)).body as unknown as Pipeline;
    expect(before.in_progress.awaiting_invoice).toHaveLength(1);
    expect(before.in_progress.awaiting_invoice_total).toBeCloseTo(50000, 2);

    // Once invoiced it leaves that column — otherwise the figure double-counts.
    const converted = await apiPost(page, `/api/quotes/${quote.body.id}/convert-to-invoice`);
    expect(converted.status).toBe(200);

    const after = (await apiGet(page, `/api/reports/pipeline${RANGE}`)).body as unknown as Pipeline;
    expect(after.in_progress.awaiting_invoice).toHaveLength(0);
    expect(after.in_progress.awaiting_invoice_total).toBe(0);
  });

  test("a partial payment reduces what is still owed instead of clearing it", async ({ page }) => {
    const client = await setupClient(page, "Encaissement Partiel");
    const invoice = await setupIssuedInvoice(page, {
      client_id: client.id,
      issue_date: "2026-06-01",
      due_date: "2026-07-01",
      lines: [{ description: "Installation", quantity: 1, unit_price: 20000, tax_rate: 0 }],
    });
    expect(invoice.status).toBe(200);

    await apiPost(page, "/api/payments", {
      invoice_id: invoice.body.id,
      amount: 8000,
      payment_date: "2026-06-15",
      payment_method: "cash",
    });

    const report = (await apiGet(page, `/api/reports/pipeline${RANGE}`)).body as unknown as Pipeline;
    const row = report.in_progress.awaiting_payment.find(
      (r) => r.number === invoice.body.invoice_number
    );
    expect(row).toBeDefined();
    expect(row!.remaining).toBeCloseTo(12000, 2);
    expect(report.in_progress.awaiting_payment_total).toBeCloseTo(12000, 2);
  });

  test("a draft invoice is not money awaiting collection", async ({ page }) => {
    const client = await setupClient(page, "Brouillon Seul");
    await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: "2026-06-01",
      lines: [{ description: "Idée", quantity: 1, unit_price: 99999, tax_rate: 0 }],
    });

    const report = (await apiGet(page, `/api/reports/pipeline${RANGE}`)).body as unknown as Pipeline;
    expect(report.in_progress.awaiting_payment).toHaveLength(0);
    expect(report.in_progress.awaiting_payment_total).toBe(0);
    expect(report.invoices.find((b) => b.status === "DRAFT")!.count).toBe(1);
  });
});
