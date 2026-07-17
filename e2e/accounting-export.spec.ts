import { test, expect } from "@playwright/test";
import {
  apiGet,
  apiPost,
  setupClient,
  setupProduct,
  setupSupplier,
} from "./api-helpers";
import { signUpSubscribed } from "./subscription-setup";

const today = () => new Date().toISOString().slice(0, 10);
const yearAgo = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
};

test.describe("Accounting export", () => {
  test.beforeEach(async ({ page }) => {
    await signUpSubscribed(page);
  });

  test("accounting export report renders and exposes journal + per-type lists", async ({
    page,
  }) => {
    // ── Sale: issued invoice ─────────────────────────────────────────────────
    const client = await setupClient(page, "Export Client");
    const inv = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: today(),
      lines: [{ description: "Sold work", quantity: 1, unit_price: 1000, tax_rate: 20 }],
    });
    expect(inv.status).toBe(200);
    await apiPost(page, `/api/invoices/${inv.body.id}/issue`);

    // ── Payment (cash) against the sale ──────────────────────────────────────
    const pay = await apiPost(page, "/api/payments", {
      invoice_id: inv.body.id,
      amount: 1200,
      payment_date: today(),
      payment_method: "CASH",
    });
    expect(pay.status).toBe(200);

    // ── Expense ──────────────────────────────────────────────────────────────
    const expense = await apiPost(page, "/api/expenses", {
      name: "Office rent",
      amount: 500,
      date: today(),
    });
    expect(expense.status).toBe(200);

    // ── Purchase: create a PO and confirm it (=> CONFIRMED, in range) ─────────
    const supplier = await setupSupplier(page, "Export Supplier");
    const product = await setupProduct(page, "Bought Item", 10, { quantity: 0 });
    const po = await apiPost(page, "/api/purchases", {
      supplier_id: supplier.id,
      order_date: today(),
      lines: [
        {
          product_id: product.id,
          quantity: 5,
          unit_price: 10,
          tax_rate: 20,
        },
      ],
    });
    expect(po.status).toBe(200);
    const confirm = await apiPost(page, `/api/purchases/${po.body.id}/confirm`, {
      paid_from_register: false,
    });
    expect(confirm.status).toBe(200);

    // ── API cross-check: journal + per-type lists populated ──────────────────
    const data = await apiGet(
      page,
      `/api/reports/accounting-export?startDate=${yearAgo()}&endDate=${today()}`
    );
    expect(data.status).toBe(200);
    const ae = data.body as Record<string, Array<Record<string, unknown>>>;
    expect(ae.sales.length).toBeGreaterThanOrEqual(1);
    expect(ae.purchases.length).toBeGreaterThanOrEqual(1);
    expect(ae.payments.length).toBeGreaterThanOrEqual(1);
    expect(ae.expenses.length).toBeGreaterThanOrEqual(1);
    // journal = sales + purchases + payments + expenses (>= 4 rows here).
    expect(ae.journal.length).toBeGreaterThanOrEqual(4);

    // ── UI: open the Accounting Export report tab ────────────────────────────
    await page.goto("/en/reports");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Accounting Export" }).click();

    // Description + per-type count cards render.
    await expect(
      page.getByText("Download a period dataset to hand over to your accountant.")
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Journal (combined)" })
    ).toBeVisible();

    // Journal table shows the seeded sale document. The invoice number appears
    // in more than one journal row (the sale + its payment reference it), so
    // scope to the first matching cell.
    await expect(
      page.getByRole("cell", { name: inv.body.invoice_number as string }).first()
    ).toBeVisible();
    // The seeded expense party is listed too.
    await expect(page.getByRole("cell", { name: "Office rent" }).first()).toBeVisible();
  });
});
