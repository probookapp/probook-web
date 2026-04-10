import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";
import { apiGet, apiPost, setupProduct, setupRegister, openSession } from "./api-helpers";

test.describe("POS transaction cancellation", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("cancel transaction restores stock", async ({ page }) => {
    const product = await setupProduct(page, "Cancel Product", 50, { quantity: 100 });
    const register = await setupRegister(page, "Cancel Register");
    const session = await openSession(page, register.id as string);

    // Create transaction that sells 15 units
    const tx = await apiPost(page, "/api/pos/transactions", {
      register_id: register.id,
      session_id: session.id,
      lines: [{
        product_id: product.id,
        designation: "Cancel Product",
        quantity: 15,
        unit_price: 50,
        tax_rate: 0,
      }],
      payments: [{ payment_method: "CASH", amount: 750 }],
    });
    expect(tx.status).toBe(200);

    // Stock should be 85
    let stock = await apiGet(page, `/api/products/${product.id}`);
    expect(stock.body.quantity).toBe(85);

    // Cancel the transaction
    const cancel = await apiPost(page, `/api/pos/transactions/${tx.body.id}/cancel`, {
      reason: "Customer refund",
    });
    expect(cancel.status).toBe(200);
    expect(cancel.body.status).toBe("CANCELLED");

    // Stock should be restored to 100
    stock = await apiGet(page, `/api/products/${product.id}`);
    expect(stock.body.quantity).toBe(100);
  });

  test("cannot cancel an already cancelled transaction", async ({ page }) => {
    const register = await setupRegister(page, "Double Cancel Register");
    const session = await openSession(page, register.id as string);

    const tx = await apiPost(page, "/api/pos/transactions", {
      register_id: register.id,
      session_id: session.id,
      lines: [{ designation: "Item", quantity: 1, unit_price: 10, tax_rate: 0 }],
      payments: [{ payment_method: "CASH", amount: 10 }],
    });

    await apiPost(page, `/api/pos/transactions/${tx.body.id}/cancel`);

    // Try again
    const second = await apiPost(page, `/api/pos/transactions/${tx.body.id}/cancel`);
    expect(second.status).toBe(400);
    expect(second.body.error).toContain("Already cancelled");
  });
});
