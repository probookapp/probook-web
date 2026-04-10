import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";
import { apiGet, apiPost, setupClient } from "./api-helpers";

test.describe("Payment workflow", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("partial payment does not mark invoice as PAID", async ({ page }) => {
    const client = await setupClient(page, "Partial Pay Client");

    const inv = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: "2024-06-01",
      lines: [{ description: "Work", quantity: 1, unit_price: 1000, tax_rate: 0 }],
    });

    // Issue the invoice first
    await apiPost(page, `/api/invoices/${inv.body.id}/issue`);

    // Pay partially (300 out of 1000)
    const payment = await apiPost(page, "/api/payments", {
      invoice_id: inv.body.id,
      amount: 300,
      payment_date: "2024-06-15",
      payment_method: "CASH",
    });
    expect(payment.status).toBe(200);

    // Invoice should still be ISSUED, not PAID
    const invoiceAfter = await apiGet(page, `/api/invoices/${inv.body.id}`);
    expect(invoiceAfter.body.status).toBe("ISSUED");
  });

  test("full payment marks invoice as PAID", async ({ page }) => {
    const client = await setupClient(page, "Full Pay Client");

    const inv = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: "2024-06-01",
      lines: [{ description: "Work", quantity: 1, unit_price: 500, tax_rate: 20 }],
    });
    // total = 500 + 100 tax = 600

    await apiPost(page, `/api/invoices/${inv.body.id}/issue`);

    // Pay in full
    const payment = await apiPost(page, "/api/payments", {
      invoice_id: inv.body.id,
      amount: 600,
      payment_date: "2024-06-15",
      payment_method: "CARD",
    });
    expect(payment.status).toBe(200);

    // Invoice should now be PAID
    const invoiceAfter = await apiGet(page, `/api/invoices/${inv.body.id}`);
    expect(invoiceAfter.body.status).toBe("PAID");
  });

  test("multiple payments add up to mark as PAID", async ({ page }) => {
    const client = await setupClient(page, "Multi Pay Client");

    const inv = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: "2024-06-01",
      lines: [{ description: "Work", quantity: 1, unit_price: 100, tax_rate: 0 }],
    });
    // total = 100

    await apiPost(page, `/api/invoices/${inv.body.id}/issue`);

    // Pay 60
    await apiPost(page, "/api/payments", {
      invoice_id: inv.body.id,
      amount: 60,
      payment_date: "2024-06-10",
      payment_method: "CASH",
    });

    // Still ISSUED
    let invoiceCheck = await apiGet(page, `/api/invoices/${inv.body.id}`);
    expect(invoiceCheck.body.status).toBe("ISSUED");

    // Pay remaining 40
    await apiPost(page, "/api/payments", {
      invoice_id: inv.body.id,
      amount: 40,
      payment_date: "2024-06-20",
      payment_method: "CASH",
    });

    // Now PAID
    invoiceCheck = await apiGet(page, `/api/invoices/${inv.body.id}`);
    expect(invoiceCheck.body.status).toBe("PAID");
  });

  test("mark-paid creates payment for remaining amount", async ({ page }) => {
    const client = await setupClient(page, "Mark Paid Client");

    const inv = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: "2024-06-01",
      lines: [{ description: "Work", quantity: 1, unit_price: 200, tax_rate: 0 }],
    });

    await apiPost(page, `/api/invoices/${inv.body.id}/issue`);

    // Pay partial first
    await apiPost(page, "/api/payments", {
      invoice_id: inv.body.id,
      amount: 50,
      payment_date: "2024-06-10",
      payment_method: "CASH",
    });

    // Mark as paid (should create a payment for remaining 150)
    const markPaid = await apiPost(page, `/api/invoices/${inv.body.id}/mark-paid`, {
      payment_method: "bank_transfer",
    });
    expect(markPaid.status).toBe(200);
    expect(markPaid.body.status).toBe("PAID");

    // Verify payments sum to total
    const payments = markPaid.body.payments as Array<Record<string, unknown>>;
    const totalPaid = payments.reduce((sum: number, p) => sum + (p.amount as number), 0);
    expect(totalPaid).toBe(200);
  });

  test("payments list returns all payments", async ({ page }) => {
    const client = await setupClient(page, "List Payments Client");

    const inv = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: "2024-06-01",
      lines: [{ description: "Work", quantity: 1, unit_price: 100, tax_rate: 0 }],
    });

    await apiPost(page, `/api/invoices/${inv.body.id}/issue`);

    await apiPost(page, "/api/payments", {
      invoice_id: inv.body.id,
      amount: 50,
      payment_date: "2024-06-10",
      payment_method: "CASH",
    });

    const list = await apiGet(page, "/api/payments");
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect((list.body as unknown as unknown[]).length).toBeGreaterThanOrEqual(1);
  });
});
