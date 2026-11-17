import { test, expect, type Page } from "@playwright/test";
import { apiGet, apiPost, apiPut, apiDelete, setupClient, setupProduct, setupSupplier } from "./api-helpers";
import { signUpSubscribed } from "./subscription-setup";

/**
 * Following money without the till: deposits on quotes carried onto the
 * invoice, purchases paid in cash outside POS mode, expenses with their method
 * and author, and the cash journal that adds it all up from a declared start.
 */

const today = () => new Date().toISOString().slice(0, 10);

type Journal = {
  start: string | null;
  rows: Array<{ kind: string; amount: number; bucket: string | null; reference: string }>;
  buckets: Record<"cash" | "cheque" | "bank", { opening: number; in: number; out: number; closing: number }>;
};

async function journal(page: Page): Promise<Journal> {
  const res = await apiGet(page, `/api/reports/cash-journal?startDate=${today()}&endDate=${today()}`);
  expect(res.status).toBe(200);
  return res.body as unknown as Journal;
}

test.describe("Cash journal and deposits", () => {
  test.beforeEach(async ({ page }) => {
    await signUpSubscribed(page);
  });

  test("a deposit on a quote follows it onto the invoice and settles it", async ({ page }) => {
    const client = await setupClient(page, "Deposit Client");
    const product = await setupProduct(page, "Deposit Widget", 1000, { purchase_price: 500, quantity: 50 });
    const quote = await apiPost(page, "/api/quotes", {
      client_id: client.id,
      issue_date: today(),
      validity_date: today(),
      lines: [{ product_id: product.id, description: "Deposit Widget", quantity: 1, unit_price: 1000, tax_rate: 0 }],
    });
    expect(quote.status).toBe(200);
    const quoteId = quote.body.id as string;

    const deposit = await apiPost(page, `/api/quotes/${quoteId}/deposits`, {
      amount: 400,
      payment_date: today(),
      payment_method: "especes",
    });
    expect(deposit.status).toBe(200);
    expect(deposit.body.invoice_id).toBeNull();

    // More than the quote is worth is refused.
    const over = await apiPost(page, `/api/quotes/${quoteId}/deposits`, {
      amount: 700,
      payment_date: today(),
      payment_method: "especes",
    });
    expect(over.status).toBe(400);

    // A quote holding money cannot be deleted out from under it.
    expect((await apiDelete(page, `/api/quotes/${quoteId}`)).status).toBe(409);

    // The quote page reads its deposits.
    const read = await apiGet(page, `/api/quotes/${quoteId}`);
    expect((read.body.deposits as unknown[]).length).toBe(1);

    // Converted: the same payment now belongs to the invoice.
    const invoice = await apiPost(page, `/api/quotes/${quoteId}/convert-to-invoice`);
    expect(invoice.status).toBe(200);
    const payments = invoice.body.payments as Array<{ id: string; amount: number }>;
    expect(payments).toHaveLength(1);
    expect(payments[0].id).toBe(deposit.body.id);

    // The rest is paid on the invoice; issuing then finds it fully paid.
    await apiPost(page, "/api/payments", {
      invoice_id: invoice.body.id,
      amount: 600,
      payment_date: today(),
      payment_method: "cheque",
      cheque_date: today(),
      cheque_number: "123456",
      cheque_bank: "BNA",
    });
    const issued = await apiPost(page, `/api/invoices/${invoice.body.id}/issue`);
    expect(issued.status).toBe(200);
    expect(issued.body.status).toBe("PAID");

    const j = await journal(page);
    expect(j.buckets.cash.in).toBe(400);
    expect(j.buckets.cheque.in).toBe(600);
  });

  test("a purchase paid in cash outside the till, an expense and the opening balance", async ({ page }) => {
    // Declared opening: 1 000 in the drawer today.
    const opening = await apiPut(page, "/api/settings/cash-journal", { start: today(), cash: 1000, cheque: 0, bank: 0 });
    expect(opening.status).toBe(200);

    const supplier = await setupSupplier(page, "Cash Supplier");
    const product = await setupProduct(page, "Bought Cash Widget", 200, { purchase_price: 100, quantity: 0 });
    const po = await apiPost(page, "/api/purchases", {
      supplier_id: supplier.id,
      order_date: today(),
      lines: [{ product_id: product.id, quantity: 3, unit_price: 100, tax_rate: 0 }],
    });
    expect(po.status).toBe(200);
    // No register, no session: paid in cash all the same.
    const confirmed = await apiPost(page, `/api/purchases/${po.body.id}/confirm`, {
      paid_from_register: false,
      payment_method: "CASH",
    });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.payment_status).toBe("PAID");

    const expense = await apiPost(page, "/api/expenses", {
      name: "Fuel",
      amount: 50,
      date: today(),
      payment_method: "especes",
    });
    expect(expense.status).toBe(200);
    expect(expense.body.payment_method).toBe("especes");
    expect((expense.body.created_by as { display_name?: string } | null)?.display_name).toBeTruthy();

    const j = await journal(page);
    expect(j.start).toBe(today());
    expect(j.buckets.cash).toEqual({ opening: 1000, in: 0, out: 350, closing: 650 });
    expect(j.rows.map((r) => r.kind).sort()).toEqual(["expense", "supplier_payment"]);
  });

  test("the Cash book tab shows the balances", async ({ page }) => {
    await apiPut(page, "/api/settings/cash-journal", { start: today(), cash: 2500, cheque: 0, bank: 0 });
    await page.goto("/en/reports");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Cash book", exact: true }).click();
    await expect(page.getByText(/2,500\.00|2 500,00|2500/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Opening balance/ })).toBeVisible();
  });
});
