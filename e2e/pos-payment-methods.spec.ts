import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";
import { apiGet, apiPost, setupClient, setupProduct, setupRegister, openSession } from "./api-helpers";

/**
 * Settling a counter sale by cheque, transfer, or on the client's account.
 *
 * The invariant that matters at the till: only cash moves the drawer. A cheque
 * is revenue but it is not money in the till, so the end-of-day expected cash
 * must ignore it — otherwise every reconciliation comes out short.
 */
async function till(page: import("@playwright/test").Page, name: string, float = 1000) {
  const register = await setupRegister(page, name);
  const session = await openSession(page, register.id as string, float);
  const product = await setupProduct(page, `${name} Product`, 100, { quantity: 50 });
  return { register, session, product };
}

const lineFor = (product: Record<string, unknown>, quantity = 1) => [
  {
    product_id: product.id,
    designation: product.designation,
    quantity,
    unit_price: product.unit_price,
    tax_rate: 0,
  },
];

test.describe("POS payment methods", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  for (const method of ["CHEQUE", "TRANSFER"] as const) {
    test(`a sale can be settled by ${method.toLowerCase()}`, async ({ page }) => {
      const { register, session, product } = await till(page, `${method} Register`);

      const sale = await apiPost(page, "/api/pos/transactions", {
        register_id: register.id,
        session_id: session.id,
        lines: lineFor(product),
        payments: [
          { payment_method: method, amount: 100, card_reference: "REF-4412" },
        ],
      });
      expect(sale.status).toBe(200);
      const payments = sale.body.payments as { payment_method: string; card_reference: string }[];
      expect(payments[0].payment_method).toBe(method);
      // The reference column predates cheques and transfers; it is reused so no
      // historical row has to move.
      expect(payments[0].card_reference).toBe("REF-4412");
    });
  }

  test("only cash counts toward the drawer", async ({ page }) => {
    const { register, session, product } = await till(page, "Drawer Register", 1000);

    await apiPost(page, "/api/pos/transactions", {
      register_id: register.id,
      session_id: session.id,
      lines: lineFor(product),
      payments: [{ payment_method: "CASH", amount: 100, cash_given: 100 }],
    });
    await apiPost(page, "/api/pos/transactions", {
      register_id: register.id,
      session_id: session.id,
      lines: lineFor(product),
      payments: [{ payment_method: "CHEQUE", amount: 100 }],
    });

    const summary = await apiGet(page, `/api/pos/sessions/${session.id}/summary`);
    expect(summary.status).toBe(200);
    // Both sales are revenue…
    expect(summary.body.total_sales).toBeCloseTo(200, 2);
    // …but only the cash one is in the till.
    expect(summary.body.expected_cash).toBeCloseTo(1100, 2);
    expect(summary.body.cash_sales).toBeCloseTo(100, 2);
  });

  test("the Z-report breaks the day down by method", async ({ page }) => {
    const { register, session, product } = await till(page, "Breakdown Register");

    await apiPost(page, "/api/pos/transactions", {
      register_id: register.id,
      session_id: session.id,
      lines: lineFor(product),
      payments: [{ payment_method: "CASH", amount: 100, cash_given: 100 }],
    });
    await apiPost(page, "/api/pos/transactions", {
      register_id: register.id,
      session_id: session.id,
      lines: lineFor(product),
      payments: [{ payment_method: "TRANSFER", amount: 100 }],
    });

    const summary = await apiGet(page, `/api/pos/sessions/${session.id}/summary`);
    const byMethod = summary.body.sales_by_method as { method: string; amount: number }[];
    const amountFor = (m: string) => byMethod.find((r) => r.method === m)?.amount ?? 0;
    // Cheques and transfers used to vanish from the breakdown while still
    // counting in total sales, so the report could not be reconciled by hand.
    expect(amountFor("CASH")).toBeCloseTo(100, 2);
    expect(amountFor("TRANSFER")).toBeCloseTo(100, 2);
    const declared = byMethod.reduce((s, r) => s + r.amount, 0);
    expect(declared).toBeCloseTo(summary.body.total_sales as number, 2);
  });

  test("a part payment leaves the rest on the client's account", async ({ page }) => {
    const { register, session, product } = await till(page, "Credit Register");
    const client = await setupClient(page, "Client À Crédit");

    const sale = await apiPost(page, "/api/pos/transactions", {
      register_id: register.id,
      session_id: session.id,
      client_id: client.id,
      lines: lineFor(product),
      payments: [
        { payment_method: "CASH", amount: 40, cash_given: 40 },
        { payment_method: "CREDIT", amount: 60 },
      ],
    });
    expect(sale.status).toBe(200);

    const payments = sale.body.payments as { payment_method: string; amount: number }[];
    // The ticket accounts for its whole total: what was paid, and what was not.
    const recorded = payments.reduce((s, p) => s + p.amount, 0);
    expect(recorded).toBeCloseTo(sale.body.final_amount as number, 2);

    const summary = await apiGet(page, `/api/pos/sessions/${session.id}/summary`);
    // The credit line is not money in the till.
    expect(summary.body.expected_cash).toBeCloseTo(1040, 2);
    const byMethod = summary.body.sales_by_method as { method: string; amount: number }[];
    expect(byMethod.find((r) => r.method === "CREDIT")?.amount).toBeCloseTo(60, 2);
  });

  test("an unknown method is refused", async ({ page }) => {
    const { register, session, product } = await till(page, "Bad Method Register");

    const sale = await apiPost(page, "/api/pos/transactions", {
      register_id: register.id,
      session_id: session.id,
      lines: lineFor(product),
      payments: [{ payment_method: "BITCOIN", amount: 100 }],
    });
    expect(sale.status).toBe(400);
  });

  test("a cash movement is accepted and lands on the right side of the drawer", async ({ page }) => {
    const { session } = await till(page, "Drawer Register", 5000);

    // The till used to send "CASH_IN" while the schema accepted only "IN", so
    // every movement was refused outright. Worse if one had got through: the
    // Z-report counts an entry with movementType === "IN" and puts everything
    // else on the other side, so a stored "CASH_IN" would have been subtracted.
    const paidIn = await apiPost(page, "/api/pos/cash-movements", {
      session_id: session.id,
      movement_type: "IN",
      amount: 3000,
      reason: "Apport de fond",
    });
    expect(paidIn.status).toBe(200);

    const takenOut = await apiPost(page, "/api/pos/cash-movements", {
      session_id: session.id,
      movement_type: "OUT",
      amount: 2000,
      reason: "Achat de fournitures",
    });
    expect(takenOut.status).toBe(200);

    const summary = await apiGet(page, `/api/pos/sessions/${session.id}/summary`);
    // The direction is what the bug got wrong, so the sign is what is asserted:
    // 3000 in and 2000 out must net to +1000, not to -5000.
    expect(summary.body.net_cash_movement).toBeCloseTo(1000, 2);

    // Float + in - out, with no sales: the arithmetic a cashier checks by hand.
    expect(summary.body.expected_cash).toBeCloseTo(5000 + 3000 - 2000, 2);
  });
});
