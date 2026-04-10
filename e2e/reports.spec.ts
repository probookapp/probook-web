import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";
import { apiGet, apiPost, setupClient, setupProduct } from "./api-helpers";

test.describe("Reports", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("revenue by month returns data for issued invoices", async ({ page }) => {
    const client = await setupClient(page, "Revenue Client");

    // Create and issue an invoice
    const inv = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: "2024-06-15",
      lines: [{ description: "Work", quantity: 1, unit_price: 1000, tax_rate: 20 }],
    });
    await apiPost(page, `/api/invoices/${inv.body.id}/issue`);

    const report = await apiGet(page, "/api/reports/revenue-by-month?startDate=2024-01-01&endDate=2024-12-31");
    expect(report.status).toBe(200);
    const data = report.body as unknown as Array<Record<string, unknown>>;
    expect(Array.isArray(data)).toBe(true);

    const june = data.find((r) => r.period === "2024-06");
    expect(june).toBeTruthy();
    expect(june!.revenue_before_tax).toBe(1000);
    expect(june!.revenue_total).toBe(1200);
    expect(june!.invoice_count).toBe(1);
  });

  test("revenue by month returns empty for no data period", async ({ page }) => {
    const report = await apiGet(page, "/api/reports/revenue-by-month?startDate=2020-01-01&endDate=2020-12-31");
    expect(report.status).toBe(200);
    expect(report.body).toEqual([]);
  });

  test("product sales report", async ({ page }) => {
    const client = await setupClient(page, "Product Sales Client");
    const product = await setupProduct(page, "Sales Product", 50, { quantity: 100 });

    const inv = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: "2024-06-01",
      lines: [{
        product_id: product.id,
        description: "Sales Product",
        quantity: 10,
        unit_price: 50,
        tax_rate: 20,
      }],
    });
    await apiPost(page, `/api/invoices/${inv.body.id}/issue`);

    const report = await apiGet(page, "/api/reports/product-sales?startDate=2024-01-01&endDate=2024-12-31");
    expect(report.status).toBe(200);
    const data = report.body as unknown as Array<Record<string, unknown>>;
    expect(data.length).toBeGreaterThanOrEqual(1);

    const item = data.find((r) => r.product_id === product.id);
    expect(item).toBeTruthy();
    expect(item!.quantity_sold).toBe(10);
    expect(item!.revenue_before_tax).toBe(500);
  });

  test("outstanding payments report", async ({ page }) => {
    const client = await setupClient(page, "Outstanding Client");

    const inv = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: "2024-01-01",
      lines: [{ description: "Work", quantity: 1, unit_price: 500, tax_rate: 0 }],
    });
    await apiPost(page, `/api/invoices/${inv.body.id}/issue`);

    const report = await apiGet(page, "/api/reports/outstanding-payments");
    expect(report.status).toBe(200);
    const data = report.body as unknown as Array<Record<string, unknown>>;
    expect(data.length).toBeGreaterThanOrEqual(1);

    const item = data.find((r) => r.invoice_id === inv.body.id);
    expect(item).toBeTruthy();
    expect(item!.total).toBe(500);
    expect((item!.days_overdue as number)).toBeGreaterThanOrEqual(0);
  });

  test("quote conversion report", async ({ page }) => {
    const client = await setupClient(page, "Conversion Client");

    // Create 3 quotes, accept 1
    for (let i = 0; i < 3; i++) {
      await apiPost(page, "/api/quotes", {
        client_id: client.id,
        issue_date: "2024-06-01",
        validity_date: "2024-07-01",
        lines: [{ description: `Q${i}`, quantity: 1, unit_price: 100, tax_rate: 0 }],
      });
    }

    const report = await apiGet(page, "/api/reports/quote-conversion");
    expect(report.status).toBe(200);
    expect(report.body.total_quotes).toBeGreaterThanOrEqual(3);
    expect(report.body.conversion_rate).toBeDefined();
    expect(typeof report.body.total_quoted_amount).toBe("number");
  });

  test("revenue by client report", async ({ page }) => {
    const client = await setupClient(page, "Revenue By Client");

    const inv = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: "2024-06-01",
      lines: [{ description: "Work", quantity: 1, unit_price: 300, tax_rate: 0 }],
    });
    await apiPost(page, `/api/invoices/${inv.body.id}/issue`);

    const report = await apiGet(page, "/api/reports/revenue-by-client?startDate=2024-01-01&endDate=2024-12-31");
    expect(report.status).toBe(200);
    const data = report.body as unknown as Array<Record<string, unknown>>;
    const item = data.find((r) => r.client_id === client.id);
    expect(item).toBeTruthy();
    expect(item!.client_name).toBe("Revenue By Client");
    expect(item!.revenue_total).toBe(300);
    expect(item!.invoice_count).toBe(1);
  });
});
