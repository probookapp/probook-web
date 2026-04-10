import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";
import { apiGet, apiPost, apiPut, apiDelete, setupProduct, setupSupplier, setupRegister, openSession } from "./api-helpers";

test.describe("Product variants", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("create, read, update, delete variant", async ({ page }) => {
    const product = await setupProduct(page, "Variant Product", 100, { has_variants: true });

    // Create variant
    const v = await apiPost(page, `/api/products/${product.id}/variants`, {
      name: "Red / Large",
      sku: "RL-001",
      barcode: "1234567890",
      quantity: 25,
      attributes: { color: "Red", size: "Large" },
    });
    expect(v.status).toBe(200);
    expect(v.body.name).toBe("Red / Large");
    expect(v.body.quantity).toBe(25);

    // Read list
    const list = await apiGet(page, `/api/products/${product.id}/variants`);
    expect(list.status).toBe(200);
    expect((list.body as unknown as unknown[]).length).toBe(1);

    // Read single
    const single = await apiGet(page, `/api/products/${product.id}/variants/${v.body.id}`);
    expect(single.status).toBe(200);
    expect(single.body.sku).toBe("RL-001");

    // Update
    const updated = await apiPut(page, `/api/products/${product.id}/variants/${v.body.id}`, {
      name: "Blue / Large",
      sku: "BL-001",
      quantity: 30,
    });
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe("Blue / Large");
    expect(updated.body.quantity).toBe(30);

    // Delete
    const del = await apiDelete(page, `/api/products/${product.id}/variants/${v.body.id}`);
    expect(del.status).toBe(204);

    // Verify gone
    const gone = await apiGet(page, `/api/products/${product.id}/variants/${v.body.id}`);
    expect(gone.status).toBe(404);
  });

  test("duplicate barcode is rejected", async ({ page }) => {
    const product = await setupProduct(page, "Barcode Product", 50, { has_variants: true });

    await apiPost(page, `/api/products/${product.id}/variants`, {
      name: "V1",
      barcode: "UNIQUE123",
      quantity: 10,
    });

    // Try duplicate barcode
    const dup = await apiPost(page, `/api/products/${product.id}/variants`, {
      name: "V2",
      barcode: "UNIQUE123",
      quantity: 5,
    });
    expect(dup.status).toBe(400);
    expect(dup.body.error).toContain("Barcode");
  });

  test("purchase order increments variant stock", async ({ page }) => {
    const product = await setupProduct(page, "Variant Stock Product", 100, { has_variants: true });
    const supplier = await setupSupplier(page, "Variant Supplier");

    const variant = await apiPost(page, `/api/products/${product.id}/variants`, {
      name: "Small",
      quantity: 10,
    });

    const po = await apiPost(page, "/api/purchases", {
      supplier_id: supplier.id,
      lines: [{
        product_id: product.id,
        variant_id: variant.body.id,
        quantity: 20,
        unit_price: 50,
      }],
    });

    await apiPost(page, `/api/purchases/${po.body.id}/confirm`, { paid_from_register: false });

    // Variant stock should be 10 + 20 = 30
    const after = await apiGet(page, `/api/products/${product.id}/variants/${variant.body.id}`);
    expect(after.body.quantity).toBe(30);
  });

  test("POS transaction decrements variant stock", async ({ page }) => {
    const product = await setupProduct(page, "POS Variant Product", 100, { has_variants: true });
    const register = await setupRegister(page, "Variant Register");
    const session = await openSession(page, register.id as string);

    const variant = await apiPost(page, `/api/products/${product.id}/variants`, {
      name: "Medium",
      quantity: 50,
    });

    await apiPost(page, "/api/pos/transactions", {
      register_id: register.id,
      session_id: session.id,
      lines: [{
        product_id: product.id,
        variant_id: variant.body.id,
        designation: "POS Variant Product - Medium",
        quantity: 8,
        unit_price: 100,
        tax_rate: 0,
      }],
      payments: [{ payment_method: "CASH", amount: 800 }],
    });

    // Variant stock should be 50 - 8 = 42
    const after = await apiGet(page, `/api/products/${product.id}/variants/${variant.body.id}`);
    expect(after.body.quantity).toBe(42);
  });

  test("deleting last variant unmarks has_variants", async ({ page }) => {
    const product = await setupProduct(page, "Last Variant Product", 50);

    const v = await apiPost(page, `/api/products/${product.id}/variants`, {
      name: "Only Variant",
      quantity: 5,
    });

    // Product should now have has_variants = true
    let prod = await apiGet(page, `/api/products/${product.id}`);
    expect(prod.body.has_variants).toBe(true);

    // Delete the only variant
    await apiDelete(page, `/api/products/${product.id}/variants/${v.body.id}`);

    // Product should have has_variants = false
    prod = await apiGet(page, `/api/products/${product.id}`);
    expect(prod.body.has_variants).toBe(false);
  });
});
