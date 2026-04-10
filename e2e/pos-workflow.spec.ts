import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";
import { apiGet, apiPost, setupProduct, setupRegister, openSession } from "./api-helpers";

test.describe("POS workflow", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("open and close a POS session", async ({ page }) => {
    const register = await setupRegister(page, "Test Register");

    // Open session
    const session = await openSession(page, register.id as string, 500);
    expect(session.id).toBeTruthy();
    expect(session.status).toBe("OPEN");
    expect(session.opening_float).toBe(500);

    // Close session
    const closed = await apiPost(page, "/api/pos/sessions/close", {
      session_id: session.id,
      actual_cash: 500,
    });
    expect(closed.status).toBe(200);
    expect(closed.body.status).toBe("CLOSED");
    expect(closed.body.actual_cash).toBe(500);
  });

  test("cannot open duplicate session on same register", async ({ page }) => {
    const register = await setupRegister(page, "Dup Register");
    await openSession(page, register.id as string);

    // Try to open another session on same register
    const second = await apiPost(page, "/api/pos/sessions/open", {
      register_id: register.id,
      opening_float: 0,
    });
    expect(second.status).toBe(409);
  });

  test("create POS transaction and verify stock decrement", async ({ page }) => {
    const register = await setupRegister(page, "TX Register");
    const session = await openSession(page, register.id as string, 1000);
    const product = await setupProduct(page, "POS Product", 25, { quantity: 100 });

    const tx = await apiPost(page, "/api/pos/transactions", {
      register_id: register.id,
      session_id: session.id,
      lines: [
        {
          product_id: product.id,
          designation: "POS Product",
          quantity: 3,
          unit_price: 25,
          tax_rate: 0,
        },
      ],
      payments: [
        { payment_method: "CASH", amount: 75 },
      ],
    });

    expect(tx.status).toBe(200);
    expect(tx.body.status).toBe("COMPLETED");
    expect(tx.body.ticket_number).toBeTruthy();
    expect(tx.body.final_amount).toBe(75);

    // Stock should decrease from 100 to 97
    const productAfter = await apiGet(page, `/api/products/${product.id}`);
    expect(productAfter.body.quantity).toBe(97);
  });

  test("POS transaction with mixed payment methods", async ({ page }) => {
    const register = await setupRegister(page, "Mixed Pay Register");
    const session = await openSession(page, register.id as string, 500);

    const tx = await apiPost(page, "/api/pos/transactions", {
      register_id: register.id,
      session_id: session.id,
      lines: [
        {
          designation: "Coffee",
          quantity: 2,
          unit_price: 5,
          tax_rate: 0,
        },
      ],
      payments: [
        { payment_method: "CASH", amount: 5 },
        { payment_method: "CARD", amount: 5 },
      ],
    });

    expect(tx.status).toBe(200);
    const payments = tx.body.payments as Array<Record<string, unknown>>;
    expect(payments).toHaveLength(2);
  });

  test("POS transaction with line discount", async ({ page }) => {
    const register = await setupRegister(page, "Discount Register");
    const session = await openSession(page, register.id as string);

    const tx = await apiPost(page, "/api/pos/transactions", {
      register_id: register.id,
      session_id: session.id,
      lines: [
        {
          designation: "Discounted Item",
          quantity: 1,
          unit_price: 100,
          tax_rate: 20,
          discount_percent: 10,
        },
      ],
      payments: [
        { payment_method: "CASH", amount: 108 },
      ],
    });

    expect(tx.status).toBe(200);
    // 100 - 10% = 90 HT, 18 tax = 108 total
    expect(tx.body.final_amount).toBe(108);
  });

  test("cash reconciliation on session close", async ({ page }) => {
    const register = await setupRegister(page, "Reconcile Register");
    const session = await openSession(page, register.id as string, 200);

    // Make a CASH transaction for 50
    await apiPost(page, "/api/pos/transactions", {
      register_id: register.id,
      session_id: session.id,
      lines: [{ designation: "Item", quantity: 1, unit_price: 50, tax_rate: 0 }],
      payments: [{ payment_method: "CASH", amount: 50 }],
    });

    // Close session — expected cash = 200 (float) + 50 (cash sale) = 250
    const closed = await apiPost(page, "/api/pos/sessions/close", {
      session_id: session.id,
      actual_cash: 240, // 10 short
    });

    expect(closed.status).toBe(200);
    expect(closed.body.expected_cash).toBe(250);
    expect(closed.body.actual_cash).toBe(240);
    expect(closed.body.cash_difference).toBe(-10);
  });

  test("cash movement affects session reconciliation", async ({ page }) => {
    const register = await setupRegister(page, "Movement Register");
    const session = await openSession(page, register.id as string, 100);

    // Add cash IN
    const cashIn = await apiPost(page, "/api/pos/cash-movements", {
      session_id: session.id,
      movement_type: "IN",
      amount: 50,
      reason: "Change added",
    });
    expect(cashIn.status).toBe(200);

    // Close — expected = 100 + 50 = 150
    const closed = await apiPost(page, "/api/pos/sessions/close", {
      session_id: session.id,
      actual_cash: 150,
    });

    expect(closed.body.expected_cash).toBe(150);
    expect(closed.body.cash_difference).toBe(0);
  });

  test("sequential ticket numbers", async ({ page }) => {
    const register = await setupRegister(page, "Ticket Register");
    const session = await openSession(page, register.id as string);

    const tx1 = await apiPost(page, "/api/pos/transactions", {
      register_id: register.id,
      session_id: session.id,
      lines: [{ designation: "T1", quantity: 1, unit_price: 10, tax_rate: 0 }],
      payments: [{ payment_method: "CASH", amount: 10 }],
    });

    const tx2 = await apiPost(page, "/api/pos/transactions", {
      register_id: register.id,
      session_id: session.id,
      lines: [{ designation: "T2", quantity: 1, unit_price: 10, tax_rate: 0 }],
      payments: [{ payment_method: "CASH", amount: 10 }],
    });

    expect(tx1.body.ticket_number).toBeTruthy();
    expect(tx2.body.ticket_number).toBeTruthy();
    expect(tx1.body.ticket_number).not.toBe(tx2.body.ticket_number);
  });
});
