import { test, expect, type Page } from "@playwright/test";
import { signUp } from "./helpers";
import {
  apiGet,
  apiPost,
  apiPut,
  apiDelete,
  setupProduct,
  setupSupplier,
  setupRegister,
  openSession,
} from "./api-helpers";

/**
 * The supplier account: one balance that can lean either way. Positive is what
 * the business owes, negative is credit the supplier holds for it (an advance,
 * an overpayment, goods sent back and kept as a payment).
 */

async function balanceOf(page: Page, supplierId: string): Promise<number> {
  const res = await apiGet(page, `/api/suppliers/${supplierId}/credits`);
  expect(res.status).toBe(200);
  return res.body.balance as number;
}

async function stockOf(page: Page, productId: string): Promise<number> {
  const res = await apiGet(page, `/api/products/${productId}`);
  return res.body.quantity as number;
}

/** A received order: 10 × 100 HT, no tax, total 1000. */
async function receivedOrder(page: Page, supplierId: string, productId: string, qty = 10) {
  const po = await apiPost(page, "/api/purchases", {
    supplier_id: supplierId,
    lines: [{ product_id: productId, quantity: qty, unit_price: 100, tax_rate: 0 }],
  });
  expect(po.status).toBe(200);
  const confirmed = await apiPost(page, `/api/purchases/${po.body.id}/confirm`, {
    paid_from_register: false,
  });
  expect(confirmed.status).toBe(200);
  return confirmed.body as Record<string, unknown> & { id: string; lines: Array<{ id: string }> };
}

test.describe("Supplier account", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("a receipt paid from the till settles the supplier's balance", async ({ page }) => {
    const supplier = await setupSupplier(page, "Till Supplier");
    const product = await setupProduct(page, "Till Product", 200, { quantity: 0 });
    const register = await setupRegister(page, "Till Register");
    const session = await openSession(page, register.id as string, 5000);

    const po = await apiPost(page, "/api/purchases", {
      supplier_id: supplier.id,
      lines: [{ product_id: product.id, quantity: 10, unit_price: 20, tax_rate: 0 }],
    });
    const confirmed = await apiPost(page, `/api/purchases/${po.body.id}/confirm`, {
      paid_from_register: true,
      register_id: register.id,
      session_id: session.id,
    });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.payment_status).toBe("PAID");

    // The cash that left the till is a payment on the supplier's account.
    const payments = await apiGet(page, `/api/suppliers/${supplier.id}/payments`);
    const list = payments.body as unknown as Array<Record<string, unknown>>;
    expect(list).toHaveLength(1);
    expect(list[0].amount).toBe(200);
    expect(list[0].from_register).toBe(true);
    expect(await balanceOf(page, supplier.id as string)).toBe(0);
  });

  test("opening balance, payment on account and adjustments lean the balance both ways", async ({ page }) => {
    const created = await apiPost(page, "/api/suppliers", { name: "Opening Supplier", opening_balance: 500 });
    expect(created.status).toBe(200);
    const supplierId = created.body.id as string;
    expect(created.body.opening_balance).toBe(500);
    expect(await balanceOf(page, supplierId)).toBe(500);

    // An advance larger than the debt: the supplier now holds credit.
    const pay = await apiPost(page, `/api/suppliers/${supplierId}/payments`, {
      amount: 800,
      payment_date: "2026-10-10",
      payment_method: "CASH",
    });
    expect(pay.status).toBe(200);
    expect(await balanceOf(page, supplierId)).toBe(-300);

    // An adjustment needs a reason and a non-zero amount.
    const noReason = await apiPost(page, `/api/suppliers/${supplierId}/adjustments`, {
      amount: 100,
      adjustment_date: "2026-10-11",
      reason: "",
    });
    expect(noReason.status).toBe(400);
    const adj = await apiPost(page, `/api/suppliers/${supplierId}/adjustments`, {
      amount: 450,
      adjustment_date: "2026-10-11",
      reason: "Old invoice found",
    });
    expect(adj.status).toBe(200);
    expect(await balanceOf(page, supplierId)).toBe(150);

    // The list sees the same balance.
    const balances = await apiGet(page, "/api/suppliers/balances");
    const rows = balances.body as unknown as Array<{ supplier_id: string; balance: number }>;
    expect(rows.find((r) => r.supplier_id === supplierId)?.balance).toBe(150);

    // The statement walks there line by line.
    const statement = await apiGet(page, `/api/suppliers/${supplierId}/statement`);
    expect(statement.status).toBe(200);
    const entries = statement.body.entries as Array<{ type: string; running_balance: number }>;
    expect(entries.map((e) => e.type)).toEqual(["opening", "payment", "adjustment"]);
    expect(entries.map((e) => e.running_balance)).toEqual([500, -300, 150]);
    expect((statement.body.totals as { closing_balance: number }).closing_balance).toBe(150);

    // Removing the adjustment brings the credit back.
    const del = await apiDelete(page, `/api/suppliers/${supplierId}/adjustments/${adj.body.id}`);
    expect(del.status).toBe(204);
    expect(await balanceOf(page, supplierId)).toBe(-300);

    // Editing the supplier without the field keeps the opening balance.
    const edited = await apiPut(page, `/api/suppliers/${supplierId}`, { name: "Opening Supplier 2" });
    expect(edited.status).toBe(200);
    expect(edited.body.opening_balance).toBe(500);

    // A supplier with history cannot be deleted.
    const delSupplier = await apiDelete(page, `/api/suppliers/${supplierId}`);
    expect(delSupplier.status).toBe(409);
  });

  test("a payment on an order cannot exceed what is left on it", async ({ page }) => {
    const supplier = await setupSupplier(page, "Overpay Supplier");
    const product = await setupProduct(page, "Overpay Product", 200, { quantity: 0 });
    const order = await receivedOrder(page, supplier.id as string, product.id as string);

    const first = await apiPost(page, `/api/suppliers/${supplier.id}/payments`, {
      amount: 600,
      payment_date: "2026-10-12",
      purchase_order_id: order.id,
    });
    expect(first.status).toBe(200);

    const credits = await apiGet(page, `/api/suppliers/${supplier.id}/credits`);
    const unpaid = credits.body.unpaid_orders as Array<{ id: string; remaining: number; payment_status: string }>;
    expect(unpaid[0].remaining).toBe(400);
    expect(unpaid[0].payment_status).toBe("PARTIAL");

    const over = await apiPost(page, `/api/suppliers/${supplier.id}/payments`, {
      amount: 401,
      payment_date: "2026-10-12",
      purchase_order_id: order.id,
    });
    expect(over.status).toBe(400);

    const rest = await apiPost(page, `/api/suppliers/${supplier.id}/payments`, {
      amount: 400,
      payment_date: "2026-10-12",
      purchase_order_id: order.id,
    });
    expect(rest.status).toBe(200);
    const after = await apiGet(page, `/api/purchases/${order.id}`);
    expect(after.body.payment_status).toBe("PAID");
  });

  test("an advance on a pending order is kept when the order is cancelled", async ({ page }) => {
    const supplier = await setupSupplier(page, "Advance Supplier");
    const product = await setupProduct(page, "Advance Product", 200, { quantity: 0 });
    const po = await apiPost(page, "/api/purchases", {
      supplier_id: supplier.id,
      lines: [{ product_id: product.id, quantity: 10, unit_price: 100, tax_rate: 0 }],
    });

    const advance = await apiPost(page, `/api/suppliers/${supplier.id}/payments`, {
      amount: 300,
      payment_date: "2026-10-12",
      purchase_order_id: po.body.id,
    });
    expect(advance.status).toBe(200);
    // Nothing received yet: the advance is credit held by the supplier.
    expect(await balanceOf(page, supplier.id as string)).toBe(-300);

    // It cannot be deleted from under its payment, only cancelled.
    const del = await apiDelete(page, `/api/purchases/${po.body.id}`);
    expect(del.status).toBe(409);
    const cancel = await apiPost(page, `/api/purchases/${po.body.id}/cancel`);
    expect(cancel.status).toBe(200);
    expect(await balanceOf(page, supplier.id as string)).toBe(-300);

    const onCancelled = await apiPost(page, `/api/suppliers/${supplier.id}/payments`, {
      amount: 10,
      payment_date: "2026-10-12",
      purchase_order_id: po.body.id,
    });
    expect(onCancelled.status).toBe(400);
  });

  test("goods returned to the supplier leave stock and come off the debt", async ({ page }) => {
    const supplier = await setupSupplier(page, "Return Supplier");
    const product = await setupProduct(page, "Return Product", 200, { quantity: 0 });
    const order = await receivedOrder(page, supplier.id as string, product.id as string);
    expect(await stockOf(page, product.id as string)).toBe(10);
    expect(await balanceOf(page, supplier.id as string)).toBe(1000);

    // More than was received on the line is refused.
    const tooMany = await apiPost(page, "/api/supplier-returns", {
      supplier_id: supplier.id,
      purchase_order_id: order.id,
      return_date: "2026-10-13",
      lines: [{ product_id: product.id, purchase_order_line_id: order.lines[0].id, quantity: 11, unit_price: 100, tax_rate: 0 }],
    });
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.code).toBe("OVER_RECEIVED");

    const ret = await apiPost(page, "/api/supplier-returns", {
      supplier_id: supplier.id,
      purchase_order_id: order.id,
      return_date: "2026-10-13",
      reason: "Damaged",
      lines: [{ product_id: product.id, purchase_order_line_id: order.lines[0].id, quantity: 3, unit_price: 100, tax_rate: 0 }],
    });
    expect(ret.status).toBe(200);
    expect(ret.body.return_number).toMatch(/^RET-\d{8}-0001$/);
    expect(ret.body.total).toBe(300);
    expect(await stockOf(page, product.id as string)).toBe(7);
    expect(await balanceOf(page, supplier.id as string)).toBe(700);
    const orderAfter = await apiGet(page, `/api/purchases/${order.id}`);
    expect(orderAfter.body.payment_status).toBe("PARTIAL");

    // The rest of the line can still go back, but no more than that.
    const again = await apiPost(page, "/api/supplier-returns", {
      supplier_id: supplier.id,
      purchase_order_id: order.id,
      return_date: "2026-10-13",
      lines: [{ product_id: product.id, purchase_order_line_id: order.lines[0].id, quantity: 8, unit_price: 100, tax_rate: 0 }],
    });
    expect(again.status).toBe(400);

    // A free return cannot take more than the shelf holds.
    const noStock = await apiPost(page, "/api/supplier-returns", {
      supplier_id: supplier.id,
      return_date: "2026-10-13",
      lines: [{ product_id: product.id, quantity: 50, unit_price: 100, tax_rate: 0 }],
    });
    expect(noStock.status).toBe(400);
    expect(noStock.body.code).toBe("INSUFFICIENT_STOCK");

    // Paid in full, then the return turns into credit in the business's favour.
    await apiPost(page, `/api/suppliers/${supplier.id}/payments`, {
      amount: 700,
      payment_date: "2026-10-14",
      purchase_order_id: order.id,
    });
    expect(await balanceOf(page, supplier.id as string)).toBe(0);
    const freeReturn = await apiPost(page, "/api/supplier-returns", {
      supplier_id: supplier.id,
      return_date: "2026-10-14",
      lines: [{ product_id: product.id, quantity: 2, unit_price: 100, tax_rate: 0 }],
    });
    expect(freeReturn.status).toBe(200);
    expect(await balanceOf(page, supplier.id as string)).toBe(-200);
    expect(await stockOf(page, product.id as string)).toBe(5);

    // The order's page lists its returns, with their lines.
    const onOrder = await apiGet(page, `/api/supplier-returns?purchase_order_id=${order.id}`);
    const orderReturns = onOrder.body as unknown as Array<{ lines: Array<{ quantity: number }> }>;
    expect(orderReturns).toHaveLength(1);
    expect(orderReturns[0].lines[0].quantity).toBe(3);

    // Cancelling a return puts the goods back and removes the credit.
    const cancel = await apiDelete(page, `/api/supplier-returns/${freeReturn.body.id}`);
    expect(cancel.status).toBe(204);
    expect(await stockOf(page, product.id as string)).toBe(7);
    expect(await balanceOf(page, supplier.id as string)).toBe(0);

    const statement = await apiGet(page, `/api/suppliers/${supplier.id}/statement`);
    const types = (statement.body.entries as Array<{ type: string }>).map((e) => e.type);
    expect(types).toContain("return");

    // The backup carries the account: returns with their lines, adjustments.
    await apiPost(page, `/api/suppliers/${supplier.id}/adjustments`, {
      amount: -50,
      adjustment_date: "2026-10-14",
      reason: "Discount",
    });
    const backup = await apiGet(page, "/api/export");
    expect(backup.status).toBe(200);
    const returns = backup.body.supplier_returns as Array<{ lines: unknown[] }>;
    expect(returns).toHaveLength(1);
    expect(returns[0].lines).toHaveLength(1);
    expect(backup.body.supplier_adjustments as unknown[]).toHaveLength(1);
  });
});
