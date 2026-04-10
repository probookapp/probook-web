import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";
import { apiGet, apiPost, setupProduct, setupSupplier, setupRegister, openSession } from "./api-helpers";

test.describe("Purchase order workflow", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("create purchase order with correct totals", async ({ page }) => {
    const supplier = await setupSupplier(page, "PO Supplier");
    const product = await setupProduct(page, "PO Product", 100, { quantity: 0 });

    const res = await apiPost(page, "/api/purchases", {
      supplier_id: supplier.id,
      lines: [
        { product_id: product.id, quantity: 20, unit_price: 50, tax_rate: 19 },
      ],
    });

    expect(res.status).toBe(200);
    const po = res.body;
    expect(po.order_number).toBeTruthy();
    expect(po.status).toBe("PENDING");
    // 20 * 50 = 1000, tax = 190, total = 1190
    expect(po.subtotal).toBe(1000);
    expect(po.tax_amount).toBe(190);
    expect(po.total).toBe(1190);
  });

  test("confirm purchase order increments stock", async ({ page }) => {
    const supplier = await setupSupplier(page, "Stock PO Supplier");
    const product = await setupProduct(page, "Stock PO Product", 100, { quantity: 10 });

    const po = await apiPost(page, "/api/purchases", {
      supplier_id: supplier.id,
      lines: [
        { product_id: product.id, quantity: 25, unit_price: 60 },
      ],
    });

    // Confirm the order
    const confirmed = await apiPost(page, `/api/purchases/${po.body.id}/confirm`, {
      paid_from_register: false,
    });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.status).toBe("CONFIRMED");

    // Check stock increased from 10 to 35
    const productAfter = await apiGet(page, `/api/products/${product.id}`);
    expect(productAfter.body.quantity).toBe(35);
  });

  test("confirm with average price calculation", async ({ page }) => {
    const supplier = await setupSupplier(page, "Avg Price Supplier");
    const product = await setupProduct(page, "Avg Price Product", 100, {
      quantity: 10,
      purchase_price: 40,
    });

    const po = await apiPost(page, "/api/purchases", {
      supplier_id: supplier.id,
      lines: [
        {
          product_id: product.id,
          quantity: 10,
          unit_price: 60,
          use_average_price: true,
        },
      ],
    });

    await apiPost(page, `/api/purchases/${po.body.id}/confirm`, {
      paid_from_register: false,
    });

    // Weighted average: (10*40 + 10*60) / 20 = 1000/20 = 50
    const productAfter = await apiGet(page, `/api/products/${product.id}`);
    expect(productAfter.body.quantity).toBe(20);
    expect(productAfter.body.purchase_price).toBe(50);
  });

  test("cannot confirm a non-PENDING order", async ({ page }) => {
    const supplier = await setupSupplier(page, "Double Confirm Supplier");
    const product = await setupProduct(page, "Double Confirm Product", 100, { quantity: 0 });

    const po = await apiPost(page, "/api/purchases", {
      supplier_id: supplier.id,
      lines: [{ product_id: product.id, quantity: 5, unit_price: 10 }],
    });

    // Confirm once
    await apiPost(page, `/api/purchases/${po.body.id}/confirm`, { paid_from_register: false });

    // Try to confirm again
    const second = await apiPost(page, `/api/purchases/${po.body.id}/confirm`, { paid_from_register: false });
    expect(second.status).toBe(400);
  });

  test("confirm with POS register payment", async ({ page }) => {
    const supplier = await setupSupplier(page, "POS PO Supplier");
    const product = await setupProduct(page, "POS PO Product", 100, { quantity: 0 });
    const register = await setupRegister(page, "PO Register");
    const session = await openSession(page, register.id as string, 5000);

    const po = await apiPost(page, "/api/purchases", {
      supplier_id: supplier.id,
      lines: [{ product_id: product.id, quantity: 10, unit_price: 20 }],
    });

    const confirmed = await apiPost(page, `/api/purchases/${po.body.id}/confirm`, {
      paid_from_register: true,
      register_id: register.id,
      session_id: session.id,
    });

    expect(confirmed.status).toBe(200);
    expect(confirmed.body.payment_status).toBe("PAID");
    expect(confirmed.body.paid_from_register).toBe(true);
  });
});
