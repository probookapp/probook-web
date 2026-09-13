import { test, expect } from "@playwright/test";
import { apiGet, apiPost, apiPut, setupProduct, setupRegister, openSession } from "./api-helpers";
import { signUpSubscribed } from "./subscription-setup";
import { clearPersistedQueryCache } from "./query-cache";

/**
 * A sale settled by more than one method.
 *
 * The till took a single method per sale, and the droit de timbre falls on the
 * cash part alone. So a customer paying 5 000 in cash and the rest by card left
 * the cashier with two wrong answers: record it all as cash and over-charge the
 * duty, or record it all as card and charge none. The tax was decided by a
 * data-entry shortcut.
 *
 * The server already priced the duty off the cash lines. What was missing was a
 * screen that could record more than one.
 */
async function till(page: import("@playwright/test").Page, name: string) {
  const register = await setupRegister(page, name);
  const session = await openSession(page, String(register.id), 0);
  const product = await setupProduct(page, `${name} Article`, 12_000, { quantity: 50 });
  return { register, session, product };
}

const lineFor = (product: Record<string, unknown>) => [
  {
    product_id: product.id,
    designation: product.designation,
    quantity: 1,
    unit_price: 12_000,
    tax_rate: 0,
  },
];

test.describe("a sale settled by more than one method", () => {
  test("the duty falls on the cash part, not on the whole ticket", async ({ page }) => {
    await signUpSubscribed(page);
    await apiPut(page, "/api/settings", { stamp_duty_enabled: true });
    const { register, session, product } = await till(page, "Caisse mixte");

    const sale = await apiPost(page, "/api/pos/transactions", {
      register_id: register.id,
      session_id: session.id,
      lines: lineFor(product),
      payments: [
        { payment_method: "CASH", amount: 5_000, cash_given: 5_050 },
        { payment_method: "CARD", amount: 7_000 },
      ],
    });

    expect(sale.status, JSON.stringify(sale.body)).toBe(200);
    // 5 000 in cash: fifty started hundreds at 1 DA. The 7 000 on the card are
    // exempt (art. 258 quinquies), so the ticket owes 50 and not 120.
    expect(Number(sale.body.stamp_duty)).toBe(50);
  });

  test("all-cash and all-card remain the two ends of the same rule", async ({ page }) => {
    await signUpSubscribed(page);
    await apiPut(page, "/api/settings", { stamp_duty_enabled: true });
    const { register, session, product } = await till(page, "Caisse extremes");

    const sell = (payments: Record<string, unknown>[]) =>
      apiPost(page, "/api/pos/transactions", {
        register_id: register.id,
        session_id: session.id,
        lines: lineFor(product),
        payments,
      });

    const cash = await sell([{ payment_method: "CASH", amount: 12_000 }]);
    expect(Number(cash.body.stamp_duty)).toBe(120);

    const card = await sell([{ payment_method: "CARD", amount: 12_000 }]);
    expect(Number(card.body.stamp_duty)).toBe(0);
  });

  test("only the cash lines move the drawer", async ({ page }) => {
    await signUpSubscribed(page);
    const { register, session, product } = await till(page, "Caisse tiroir");

    const sale = await apiPost(page, "/api/pos/transactions", {
      register_id: register.id,
      session_id: session.id,
      lines: lineFor(product),
      payments: [
        { payment_method: "CASH", amount: 4_000 },
        { payment_method: "CHEQUE", amount: 8_000, card_reference: "CHQ-77" },
      ],
    });
    expect(sale.status, JSON.stringify(sale.body)).toBe(200);

    // A cheque is revenue but it is not money in the till. Counting it would
    // leave every end-of-day reconciliation short by the cheque.
    const summary = await apiGet(page, `/api/pos/sessions/${session.id}/summary`);
    expect(summary.status).toBe(200);
    expect(Number(summary.body.expected_cash)).toBe(4_000);
  });

  test("the split is visible on the sale, line by line", async ({ page }) => {
    await signUpSubscribed(page);
    const { register, session, product } = await till(page, "Caisse detail");

    const sale = await apiPost(page, "/api/pos/transactions", {
      register_id: register.id,
      session_id: session.id,
      lines: lineFor(product),
      payments: [
        { payment_method: "CASH", amount: 2_000, cash_given: 2_000 },
        { payment_method: "CARD", amount: 10_000 },
      ],
    });
    expect(sale.status, JSON.stringify(sale.body)).toBe(200);

    // Both lines are kept: a ticket that collapsed them would lose the evidence
    // the duty was computed from.
    const payments = sale.body.payments as unknown as {
      payment_method: string;
      amount: string | number;
    }[];
    expect(payments.map((p) => p.payment_method).sort()).toEqual(["CARD", "CASH"]);
    expect(payments.reduce((sum, p) => sum + Number(p.amount), 0)).toBe(12_000);
  });

  test("the till screen records two methods on one sale", async ({ page }) => {
    await signUpSubscribed(page);
    await apiPut(page, "/api/settings", { stamp_duty_enabled: true });
    const { session, product } = await till(page, "Caisse ecran");

    // Sign-up cached the settings as they were; without this the duty line the
    // cashier is meant to see would not render.
    await clearPersistedQueryCache(page);
    await page.goto("/fr/pos");
    await page.getByPlaceholder(/Rechercher/i).fill(product.designation as string);
    await page
      .getByRole("button")
      .filter({ hasText: product.designation as string })
      .first()
      .click();

    await page.getByRole("button").filter({ hasText: /Payer|Encaisser/i }).first().click();
    const modal = page.locator("div.fixed.inset-0").last();

    // Take 5 000 in cash, then bank it and pay the rest by card.
    await modal.locator("#pos-cash-given").fill("5000");
    const addLine = modal.getByRole("button", { name: /payer le reste autrement/i });
    await expect(addLine).toBeVisible();
    await addLine.click();

    // The banked line is listed, and the sale is not finished yet.
    await expect(modal.getByText(/Reste à régler/i)).toBeVisible();

    await modal.getByRole("button").filter({ hasText: /^Carte$/i }).first().click();
    const confirm = modal.getByRole("button", { name: /Confirmer|Valider/i });
    await expect(confirm).toBeEnabled();
    await confirm.click();

    // The sale reaches the server as two lines, and the duty follows the cash.
    await expect(page.getByPlaceholder(/Rechercher/i)).toBeVisible({ timeout: 20_000 });
    const sales = await apiGet(page, `/api/pos/sessions/${session.id}/transactions`);
    expect(sales.status, JSON.stringify(sales.body).slice(0, 200)).toBe(200);
    const body = sales.body as unknown as { data?: unknown[] } | unknown[];
    const rows = (Array.isArray(body) ? body : (body.data ?? [])) as {
      stamp_duty: string | number;
      payments?: unknown[];
    }[];
    expect(rows.length, "the sale should have been recorded").toBeGreaterThan(0);

    const latest = rows[0];
    expect(Number(latest.stamp_duty)).toBe(50);
    expect(latest.payments?.length, "both settlements are kept").toBe(2);
  });
});
