import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";
import { apiGet, apiPost, setupClient, setupProduct, setupSupplier, setupRegister, openSession } from "./api-helpers";

test.describe("Stock lifecycle — purchase → sell → reconcile", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("full stock lifecycle: purchase order → invoice sale → POS sale", async ({ page }) => {
    const client = await setupClient(page, "Lifecycle Client");
    const supplier = await setupSupplier(page, "Lifecycle Supplier");
    const product = await setupProduct(page, "Lifecycle Product", 100, { quantity: 0 });

    // ── Step 1: Purchase 50 units ──────────────────────────────────────
    const po = await apiPost(page, "/api/purchases", {
      supplier_id: supplier.id,
      lines: [{ product_id: product.id, quantity: 50, unit_price: 40 }],
    });
    await apiPost(page, `/api/purchases/${po.body.id}/confirm`, { paid_from_register: false });

    let stock = await apiGet(page, `/api/products/${product.id}`);
    expect(stock.body.quantity).toBe(50);

    // ── Step 2: Sell 10 via invoice ────────────────────────────────────
    const inv = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: "2024-06-01",
      lines: [{
        product_id: product.id,
        description: "Lifecycle Product",
        quantity: 10,
        unit_price: 100,
        tax_rate: 20,
      }],
    });
    await apiPost(page, `/api/invoices/${inv.body.id}/issue`);

    stock = await apiGet(page, `/api/products/${product.id}`);
    expect(stock.body.quantity).toBe(40); // 50 - 10

    // ── Step 3: Sell 5 via POS ─────────────────────────────────────────
    const register = await setupRegister(page, "Lifecycle Register");
    const session = await openSession(page, register.id as string);

    await apiPost(page, "/api/pos/transactions", {
      register_id: register.id,
      session_id: session.id,
      lines: [{
        product_id: product.id,
        designation: "Lifecycle Product",
        quantity: 5,
        unit_price: 100,
        tax_rate: 0,
      }],
      payments: [{ payment_method: "CASH", amount: 500 }],
    });

    stock = await apiGet(page, `/api/products/${product.id}`);
    expect(stock.body.quantity).toBe(35); // 40 - 5

    // ── Step 4: Purchase 20 more ───────────────────────────────────────
    const po2 = await apiPost(page, "/api/purchases", {
      supplier_id: supplier.id,
      lines: [{ product_id: product.id, quantity: 20, unit_price: 45 }],
    });
    await apiPost(page, `/api/purchases/${po2.body.id}/confirm`, { paid_from_register: false });

    stock = await apiGet(page, `/api/products/${product.id}`);
    expect(stock.body.quantity).toBe(55); // 35 + 20
  });

  test("multiple invoices decrement stock correctly", async ({ page }) => {
    const client = await setupClient(page, "Multi Invoice Client");
    const product = await setupProduct(page, "Multi Invoice Product", 50, { quantity: 100 });

    // Create and issue 3 invoices
    for (const qty of [10, 20, 30]) {
      const inv = await apiPost(page, "/api/invoices", {
        client_id: client.id,
        issue_date: "2024-06-01",
        lines: [{
          product_id: product.id,
          description: "Multi Invoice Product",
          quantity: qty,
          unit_price: 50,
          tax_rate: 0,
        }],
      });
      await apiPost(page, `/api/invoices/${inv.body.id}/issue`);
    }

    // 100 - 10 - 20 - 30 = 40
    const stock = await apiGet(page, `/api/products/${product.id}`);
    expect(stock.body.quantity).toBe(40);
  });
});
