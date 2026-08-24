import { test, expect, type Page } from "@playwright/test";
import { apiGet, apiPost, apiPut, setupClient, setupProduct, setupRegister, openSession } from "./api-helpers";
import { signUpSubscribed } from "./subscription-setup";

const today = () => new Date().toISOString().slice(0, 10);
const yearAgo = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
};

test.describe("Stamp duty & tax reporting", () => {
  test.beforeEach(async ({ page }) => {
    await signUpSubscribed(page);
  });

  test("enabling stamp duty in Settings applies droit de timbre to an issued invoice", async ({
    page,
  }) => {
    // ── Enable stamp duty via the Settings UI (toggle only) ───────────────────
    // There is no rate input: the rate is fixed by the legal progressive scale
    // (see src/lib/stamp-duty.ts), so Settings only exposes the on/off switch.
    await page.goto("/en/settings");
    await page.waitForLoadState("networkidle");

    // The account was created without an email, so the Company Information form's
    // Email field defaults to "" which fails the `.email()` rule and blocks the
    // whole form save. Fill a valid email so the (unrelated) save can proceed.
    // NOTE: app bug — an empty email should be treated as "unset", not invalid.
    await page.getByLabel("Email", { exact: true }).fill("owner@example.com");

    await page.getByText("Apply stamp duty on cash payments").click();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Settings saved successfully!")).toBeVisible({ timeout: 15_000 });

    // Confirm the setting persisted.
    const settings = await apiGet(page, "/api/settings");
    expect(settings.body.stamp_duty_enabled).toBe(true);

    // ── Issue a CASH invoice (total 1000, 0% VAT) => stamp duty snapshot = 10 ──
    // Droit de timbre only applies to cash-settled invoices, so the sale must be
    // flagged is_cash_sale (the invoice form defaults this on when timbre is
    // enabled; here we set it explicitly since we post via the API).
    const client = await setupClient(page, "Timbre Client");
    const inv = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: today(),
      is_cash_sale: true,
      lines: [{ description: "Cash sale", quantity: 1, unit_price: 1000, tax_rate: 0 }],
    });
    expect(inv.status).toBe(200);
    const issued = await apiPost(page, `/api/invoices/${inv.body.id}/issue`);
    expect(issued.status).toBe(200);

    // API: 1000 DA falls in the 301–30 000 bracket → 1 DA per started 100 DA = 10.
    const fetched = await apiGet(page, `/api/invoices/${inv.body.id}`);
    expect(fetched.body.stamp_duty).toBe(10);

    // Invoice view shows the stamp-duty line + total-with-timbre (1010).
    await page.goto(`/en/invoices/${inv.body.id}`);
    await page.waitForLoadState("networkidle");
    // Match the stamp-duty line item specifically ("Stamp duty (1%)"); a plain
    // "Stamp duty" substring also matches "Total payable (incl. stamp duty)".
    await expect(page.getByText(/Stamp duty \(\d/)).toBeVisible();
    await expect(page.getByText("Total payable (incl. stamp duty)")).toBeVisible();
    // The 1,010 total-with-timbre is rendered in several places (totals block +
    // summary paragraphs), so scope to the first match.
    await expect(page.getByText(/1[\s,.]?010/).first()).toBeVisible();

    // Client statement/balance includes the timbre: closing = 1000 + 10.
    const stmt = await apiGet(page, `/api/clients/${client.id}/statement`);
    expect((stmt.body.totals as Record<string, number>).closing_balance).toBe(1010);
    const balances = await apiGet(page, "/api/clients/balances");
    const entry = (balances.body as unknown as Array<Record<string, unknown>>).find(
      (b) => b.client_id === client.id
    );
    expect((entry as Record<string, number>).balance).toBe(1010);
  });

  test("tax summary report renders sales VAT and stamp-duty-due figures", async ({ page }) => {
    // Enable stamp duty (via API — the UI toggle is covered above).
    const upd = await apiPut(page, "/api/settings", { stamp_duty_enabled: true });
    expect(upd.status).toBe(200);

    // Seed a cash sale (total 1200 incl. 200 VAT) fully paid in cash.
    //
    // `is_cash_sale` matters and is not the default on this route: the timbre is
    // frozen onto the invoice when it is issued, and the report sums those
    // snapshots rather than recomputing from payments. An invoice issued as a
    // non-cash sale carries no timbre even if the client later pays cash — see
    // the second half of this test.
    const client = await setupClient(page, "Tax Client");
    const inv = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: today(),
      is_cash_sale: true,
      lines: [{ description: "Taxable sale", quantity: 1, unit_price: 1000, tax_rate: 20 }],
    });
    expect(inv.status).toBe(200);
    await apiPost(page, `/api/invoices/${inv.body.id}/issue`);
    const pay = await apiPost(page, "/api/payments", {
      invoice_id: inv.body.id,
      amount: 1200,
      payment_date: today(),
      payment_method: "CASH",
    });
    expect(pay.status).toBe(200);

    // ── API cross-check ──────────────────────────────────────────────────────
    const summary = await apiGet(
      page,
      `/api/reports/tax-summary?startDate=${yearAgo()}&endDate=${today()}`
    );
    expect(summary.status).toBe(200);
    expect((summary.body.sales as Record<string, number>).total_vat).toBe(200);
    const stampDuty = summary.body.stamp_duty as Record<string, number | boolean>;
    expect(stampDuty.enabled).toBe(true);
    // The legal scale on a 1200 DA total: 12 started hundreds at 1 DA each. The
    // figure comes from the invoice's own snapshot, so the report and the
    // document can be reconciled line by line — which is the only thing a tax
    // return has to do.
    expect(stampDuty.amount_due).toBe(12);


    // ── UI: open the Tax Summary report tab ──────────────────────────────────
    await page.goto("/en/reports");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Tax Summary" }).click();

    // Collected-VAT and stamp-duty-due cards render.
    await expect(page.getByText("Collected VAT (sales)")).toBeVisible();
    await expect(page.getByText("Stamp duty due")).toBeVisible();
    // Sales VAT value (200) and stamp duty due value (12) appear.
    await expect(page.getByText(/\b200\b/).first()).toBeVisible();
    await expect(page.getByText(/\b12\b/).first()).toBeVisible();
  });

  test("a sale not issued as cash carries no timbre, whatever pays it", async ({ page }) => {
    await apiPut(page, "/api/settings", { stamp_duty_enabled: true });
    const client = await setupClient(page, "Transfer Client");

    // Declared as not settled in cash, so the snapshot is frozen at 0. Paying it
    // in cash afterwards does not retroactively bill a timbre, and the report
    // must not invent one — declaring a tax that was never charged is worse than
    // declaring none. (Whether the timbre is legally due on a cash settlement of
    // a non-cash invoice is a question for an accountant, not for this report.)
    //
    // The flag is spelled out: a new invoice assumes a cash sale by default, the
    // ordinary case in this market. See DEFAULT_IS_CASH_SALE.
    const inv = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: today(),
      is_cash_sale: false,
      lines: [{ description: "Bank transfer sale", quantity: 1, unit_price: 1000, tax_rate: 20 }],
    });
    await apiPost(page, `/api/invoices/${inv.body.id}/issue`);
    await apiPost(page, "/api/payments", {
      invoice_id: inv.body.id,
      amount: 1200,
      payment_date: today(),
      payment_method: "CASH",
    });

    const summary = await apiGet(
      page,
      `/api/reports/tax-summary?startDate=${yearAgo()}&endDate=${today()}`
    );
    expect((summary.body.stamp_duty as Record<string, number>).amount_due).toBe(0);
  });
});

test.describe("Stamp duty at the till", () => {
  test("a cash ticket carries the duty; a card ticket carries none", async ({ page }) => {
    await signUpSubscribed(page);
    await apiPut(page, "/api/settings", { stamp_duty_enabled: true });

    const product = await setupProduct(page, "Article comptoir", 5000, { quantity: 50 });
    const register = await setupRegister(page, "Caisse timbre");
    const session = await openSession(page, String(register.id), 0);

    const sell = async (method: string) =>
      apiPost(page, "/api/pos/transactions", {
        register_id: register.id,
        session_id: session.id,
        lines: [
          {
            product_id: product.id,
            designation: "Article comptoir",
            quantity: 1,
            unit_price: 5000,
            tax_rate: 0,
          },
        ],
        payments: [{ payment_method: method, amount: 5000 }],
      });

    // 5 000 DA settled in cash: fifty started hundreds at 1 DA each.
    const cash = await sell("CASH");
    expect(cash.status, JSON.stringify(cash.body)).toBe(200);
    expect(Number(cash.body.stamp_duty)).toBe(50);

    // The same sale paid by card is exempt (art. 258 quinquies). Charging it
    // would tax exactly what the 2025 Finance Act set out to exempt.
    const card = await sell("CARD");
    expect(Number(card.body.stamp_duty)).toBe(0);

    // And the tax return sums what was billed, tickets included — a return that
    // counted only invoices would under-declare every counter sale.
    const summary = await apiGet(
      page,
      `/api/reports/tax-summary?startDate=${yearAgo()}&endDate=${today()}`
    );
    expect((summary.body.stamp_duty as Record<string, number>).amount_due).toBe(50);
  });
});

/**
 * Article 258 exempts a cheque-settled receipt — but only one that states the
 * cheque's date, its number and the drawee.
 *
 * The guard has to hold on both surfaces and refuse on neither regime: a
 * business under French rules owes none of this paperwork, and a guard that
 * asked it anyway would be Algerian law imposed on someone it does not bind.
 */
test.describe("The mentions that exempt a cheque", () => {
  const chequeSale = (
    register: Record<string, unknown>,
    session: Record<string, unknown>,
    product: Record<string, unknown>,
    mentions: Record<string, string> = {}
  ) => ({
    register_id: register.id,
    session_id: session.id,
    lines: [
      {
        product_id: product.id,
        designation: "Article chèque",
        quantity: 1,
        unit_price: 5000,
        tax_rate: 0,
      },
    ],
    payments: [{ payment_method: "CHEQUE", amount: 5000, ...mentions }],
  });

  test("the till refuses a cheque without them, and takes one that carries them", async ({
    page,
  }) => {
    await signUpSubscribed(page);
    await apiPut(page, "/api/settings", { stamp_duty_enabled: true });

    const product = await setupProduct(page, "Article chèque", 5000, { quantity: 50 });
    const register = await setupRegister(page, "Caisse chèque");
    const session = await openSession(page, String(register.id), 0);

    const bare = await apiPost(page, "/api/pos/transactions", chequeSale(register, session, product));
    expect(bare.status, JSON.stringify(bare.body)).toBe(400);
    expect(bare.body.code).toBe("CHEQUE_MENTIONS_REQUIRED");
    expect(bare.body.missing).toEqual(["cheque_date", "cheque_number", "cheque_bank"]);

    // Naming what is missing rather than refusing the sale outright: the cashier
    // has the cheque in hand and can read all three off it.
    const partial = await apiPost(
      page,
      "/api/pos/transactions",
      chequeSale(register, session, product, { cheque_number: "1234567" })
    );
    expect(partial.status).toBe(400);
    expect(partial.body.missing).toEqual(["cheque_date", "cheque_bank"]);

    const complete = await apiPost(
      page,
      "/api/pos/transactions",
      chequeSale(register, session, product, {
        cheque_date: today(),
        cheque_number: "1234567",
        cheque_bank: "BNA",
      })
    );
    expect(complete.status, JSON.stringify(complete.body)).toBe(200);
    // Exempt, which is the entire point of carrying the mentions.
    expect(Number(complete.body.stamp_duty)).toBe(0);
  });

  test("recording a cheque against an invoice is held to the same rule", async ({ page }) => {
    await signUpSubscribed(page);
    await apiPut(page, "/api/settings", { stamp_duty_enabled: true });
    const client = await setupClient(page, "Client chèque");

    const inv = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: today(),
      is_cash_sale: false,
      lines: [{ description: "Prestation", quantity: 1, unit_price: 1000, tax_rate: 0 }],
    });
    await apiPost(page, `/api/invoices/${inv.body.id}/issue`);

    const bare = await apiPost(page, "/api/payments", {
      invoice_id: inv.body.id,
      amount: 1000,
      payment_date: today(),
      payment_method: "cheque",
    });
    expect(bare.status, JSON.stringify(bare.body)).toBe(400);
    expect(bare.body.code).toBe("CHEQUE_MENTIONS_REQUIRED");

    const complete = await apiPost(page, "/api/payments", {
      invoice_id: inv.body.id,
      amount: 1000,
      payment_date: today(),
      payment_method: "cheque",
      cheque_date: today(),
      cheque_number: "7654321",
      cheque_bank: "CPA",
    });
    expect(complete.status, JSON.stringify(complete.body)).toBe(200);
    expect(complete.body.cheque_number).toBe("7654321");
    expect(complete.body.cheque_bank).toBe("CPA");
  });

  test("a business the duty does not reach is never asked for them", async ({ page }) => {
    await signUpSubscribed(page);
    // France has no droit de timbre, so the mentions have nothing to justify.
    await apiPut(page, "/api/settings", { fiscal_profile: "FR", stamp_duty_enabled: true });
    const client = await setupClient(page, "Client français");

    const inv = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: today(),
      lines: [{ description: "Prestation", quantity: 1, unit_price: 1000, tax_rate: 20 }],
    });
    await apiPost(page, `/api/invoices/${inv.body.id}/issue`);

    const paid = await apiPost(page, "/api/payments", {
      invoice_id: inv.body.id,
      amount: 1200,
      payment_date: today(),
      payment_method: "cheque",
    });
    expect(paid.status, JSON.stringify(paid.body)).toBe(200);
  });

  test("a business that has not turned the duty on is never asked either", async ({ page }) => {
    await signUpSubscribed(page);
    const client = await setupClient(page, "Client sans timbre");

    const inv = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: today(),
      lines: [{ description: "Prestation", quantity: 1, unit_price: 1000, tax_rate: 0 }],
    });
    await apiPost(page, `/api/invoices/${inv.body.id}/issue`);

    const paid = await apiPost(page, "/api/payments", {
      invoice_id: inv.body.id,
      amount: 1000,
      payment_date: today(),
      payment_method: "cheque",
    });
    expect(paid.status, JSON.stringify(paid.body)).toBe(200);
  });
});
