import { test, expect, type Page } from "@playwright/test";
import {
  apiGet,
  apiPost,
  setupClient,
  setupProduct,
  setupSupplier,
  setupRegister,
  openSession,
} from "./api-helpers";
import { signUpSubscribed } from "./subscription-setup";

const today = () => new Date().toISOString().slice(0, 10);

/** Open the Reports page and wait for its queries to settle. */
async function gotoReports(page: Page) {
  await page.goto("/en/reports");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
}

/** Switch to a report tab by its (accessible) button label. */
async function openTab(page: Page, label: string) {
  await page.getByRole("button", { name: label, exact: true }).click();
}

test.describe("New reports tabs", () => {
  test.beforeEach(async ({ page }) => {
    await signUpSubscribed(page);
  });

  test("Profit / Margin tab renders seeded figures and endpoint agrees", async ({ page }) => {
    const client = await setupClient(page, "Margin Client");
    const product = await setupProduct(page, "Margin Widget", 1000, {
      purchase_price: 600,
      quantity: 100,
    });
    const inv = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: today(),
      lines: [
        {
          product_id: product.id,
          description: "Margin Widget",
          quantity: 1,
          unit_price: 1000,
          tax_rate: 20,
        },
      ],
    });
    await apiPost(page, `/api/invoices/${inv.body.id}/issue`);

    // Endpoint cross-check.
    const report = await apiGet(
      page,
      `/api/reports/profit-margin?startDate=2024-01-01&endDate=${today()}`
    );
    expect(report.status).toBe(200);
    const rows = report.body as unknown as Array<Record<string, unknown>>;
    const item = rows.find((r) => r.product_id === product.id);
    expect(item).toBeTruthy();
    expect(item!.revenue).toBe(1000);
    expect(typeof item!.margin).toBe("number");

    // UI renders the tab with the seeded product row.
    await gotoReports(page);
    await openTab(page, "Profit / Margin");
    await expect(page.getByText("Margin Widget").first()).toBeVisible();
    // Export controls are present on this report tab.
    await expect(page.getByRole("button", { name: "Export PDF" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export CSV" })).toBeVisible();
  });

  test("Supplier Spend tab renders seeded figures and endpoint agrees", async ({ page }) => {
    const supplier = await setupSupplier(page, "Acme Supplies");
    const product = await setupProduct(page, "Bought Widget", 200, {
      purchase_price: 100,
      quantity: 0,
    });
    const po = await apiPost(page, "/api/purchases", {
      supplier_id: supplier.id,
      order_date: today(),
      lines: [{ product_id: product.id, quantity: 5, unit_price: 100, tax_rate: 0 }],
    });
    expect(po.status).toBe(200);
    // Receive-all (no lines) confirms the order → status CONFIRMED.
    const confirmed = await apiPost(page, `/api/purchases/${po.body.id}/confirm`, {
      paid_from_register: false,
    });
    expect(confirmed.status).toBe(200);

    const report = await apiGet(
      page,
      `/api/reports/supplier-spend?startDate=2024-01-01&endDate=${today()}`
    );
    expect(report.status).toBe(200);
    const rows = report.body as unknown as Array<Record<string, unknown>>;
    const item = rows.find((r) => r.supplier_id === supplier.id);
    expect(item).toBeTruthy();
    expect(item!.order_count).toBe(1);
    expect(item!.total_spend).toBe(500);

    await gotoReports(page);
    await openTab(page, "Supplier Spend");
    await expect(page.getByText("Acme Supplies").first()).toBeVisible();
  });

  test("Expenses tab renders seeded figures and endpoint agrees", async ({ page }) => {
    const exp = await apiPost(page, "/api/expenses", {
      name: "Office Rent",
      amount: 5000,
      date: today(),
    });
    expect(exp.status).toBe(200);
    const period = today().slice(0, 7); // YYYY-MM

    const report = await apiGet(
      page,
      `/api/reports/expenses?startDate=2024-01-01&endDate=${today()}`
    );
    expect(report.status).toBe(200);
    const rows = report.body as unknown as Array<Record<string, unknown>>;
    const item = rows.find((r) => r.period === period);
    expect(item).toBeTruthy();
    expect(item!.expense_count).toBe(1);
    expect(item!.total_amount).toBe(5000);

    await gotoReports(page);
    await openTab(page, "Expenses");
    await expect(page.getByText(period).first()).toBeVisible();
  });

  test("POS Daily (Z-report) tab renders seeded figures and endpoint agrees", async ({ page }) => {
    const register = await setupRegister(page, "Z Register");
    const session = await openSession(page, register.id as string, 100);
    const tx = await apiPost(page, "/api/pos/transactions", {
      register_id: register.id,
      session_id: session.id,
      lines: [
        { designation: "Coffee", quantity: 2, unit_price: 100, tax_rate: 20 },
      ],
      payments: [{ payment_method: "CASH", amount: 240 }],
    });
    expect(tx.status).toBe(200);

    const report = await apiGet(page, `/api/pos/reports/daily?date=${today()}`);
    expect(report.status).toBe(200);
    expect(report.body.transaction_count).toBe(1);
    expect(report.body.total_sales).toBe(240);
    expect(report.body.cash_sales).toBe(240);

    await gotoReports(page);
    await openTab(page, "POS Daily (Z-Report)");
    // Stat grid rendered (not the empty-state message).
    await expect(page.getByText("Total Sales").first()).toBeVisible();
    await expect(page.getByText("No sales for this day")).toHaveCount(0);
  });
});
