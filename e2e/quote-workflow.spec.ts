import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";
import { apiGet, apiPost, apiPut, apiDelete, setupClient } from "./api-helpers";

test.describe("Quote workflow", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("create quote with correct totals", async ({ page }) => {
    const client = await setupClient(page, "Quote Client");

    const res = await apiPost(page, "/api/quotes", {
      client_id: client.id,
      issue_date: "2024-06-01",
      validity_date: "2024-07-01",
      lines: [
        { description: "Consulting", quantity: 10, unit_price: 150, tax_rate: 20 },
        { description: "License", quantity: 1, unit_price: 500, tax_rate: 0 },
      ],
    });

    expect(res.status).toBe(200);
    const quote = res.body;
    expect(quote.quote_number).toBeTruthy();
    expect(quote.status).toBe("DRAFT");

    // Line 1: 1500 + 300 tax = 1800
    // Line 2: 500 + 0 tax = 500
    // Total: subtotal=2000, tax=300, total=2300
    expect(quote.subtotal).toBe(2000);
    expect(quote.tax_amount).toBe(300);
    expect(quote.total).toBe(2300);
  });

  test("update quote lines recalculates totals", async ({ page }) => {
    const client = await setupClient(page, "Quote Update Client");

    const quote = await apiPost(page, "/api/quotes", {
      client_id: client.id,
      issue_date: "2024-06-01",
      validity_date: "2024-07-01",
      lines: [{ description: "Original", quantity: 1, unit_price: 100, tax_rate: 20 }],
    });

    const updated = await apiPut(page, `/api/quotes/${quote.body.id}`, {
      client_id: client.id,
      status: "DRAFT",
      issue_date: "2024-06-01",
      validity_date: "2024-07-01",
      lines: [
        { description: "Updated", quantity: 3, unit_price: 200, tax_rate: 10 },
      ],
    });

    expect(updated.status).toBe(200);
    // 3 * 200 = 600, tax = 60, total = 660
    expect(updated.body.subtotal).toBe(600);
    expect(updated.body.tax_amount).toBe(60);
    expect(updated.body.total).toBe(660);
  });

  test("delete quote", async ({ page }) => {
    const client = await setupClient(page, "Quote Delete Client");

    const quote = await apiPost(page, "/api/quotes", {
      client_id: client.id,
      issue_date: "2024-06-01",
      validity_date: "2024-07-01",
      lines: [{ description: "Temp", quantity: 1, unit_price: 10, tax_rate: 0 }],
    });

    const del = await apiDelete(page, `/api/quotes/${quote.body.id}`);
    expect(del.status).toBe(204);

    const gone = await apiGet(page, `/api/quotes/${quote.body.id}`);
    expect(gone.status).toBe(404);
  });

  test("sequential quote numbers", async ({ page }) => {
    const client = await setupClient(page, "Quote Numbering Client");

    const q1 = await apiPost(page, "/api/quotes", {
      client_id: client.id,
      issue_date: "2024-06-01",
      validity_date: "2024-07-01",
      lines: [{ description: "Q1", quantity: 1, unit_price: 10, tax_rate: 0 }],
    });

    const q2 = await apiPost(page, "/api/quotes", {
      client_id: client.id,
      issue_date: "2024-06-01",
      validity_date: "2024-07-01",
      lines: [{ description: "Q2", quantity: 1, unit_price: 10, tax_rate: 0 }],
    });

    expect(q1.body.quote_number).toBeTruthy();
    expect(q2.body.quote_number).toBeTruthy();
    expect(q1.body.quote_number).not.toBe(q2.body.quote_number);
  });

  test("quote with shipping cost", async ({ page }) => {
    const client = await setupClient(page, "Quote Shipping Client");

    const res = await apiPost(page, "/api/quotes", {
      client_id: client.id,
      issue_date: "2024-06-01",
      validity_date: "2024-07-01",
      shipping_cost: 30,
      shipping_tax_rate: 20,
      lines: [{ description: "Item", quantity: 1, unit_price: 100, tax_rate: 20 }],
    });

    expect(res.status).toBe(200);
    // Line: 100 + 20 tax
    // Shipping: 30 + 6 tax
    // Total: subtotal=130, tax=26, total=156
    expect(res.body.subtotal).toBe(130);
    expect(res.body.tax_amount).toBe(26);
    expect(res.body.total).toBe(156);
  });
});
