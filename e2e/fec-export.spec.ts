import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";
import { apiPost, apiPut, setupRegister, openSession } from "./api-helpers";

/**
 * The FEC export (src/lib/fec.ts): sales, a credit note, a till sale and a
 * payment come out as balanced écritures in the legal 18-column layout.
 */
const today = () => new Date().toISOString().slice(0, 10);

test.describe("FEC export", () => {
  test("every écriture of the period balances", async ({ page }) => {
    await signUp(page);
    await apiPut(page, "/api/settings", { fiscal_profile: "FR", currency: "EUR", siret: "12345678900012" });
    const client = await apiPost(page, "/api/clients", { name: "Client SARL" });
    const invoice = await apiPost(page, "/api/invoices", {
      client_id: client.body.id,
      issue_date: today(),
      discount_percent: 5,
      shipping_cost: 9.9,
      shipping_tax_rate: 20,
      lines: [
        { description: "Chaise", quantity: 3, unit_price: 49.99, tax_rate: 20, discount_percent: 10 },
        { description: "Livre", quantity: 1, unit_price: 12.5, tax_rate: 5.5 },
      ],
    });
    await apiPost(page, `/api/invoices/${invoice.body.id}/issue`);
    await apiPost(page, "/api/payments", { invoice_id: invoice.body.id, amount: 50, payment_date: today(), payment_method: "transfer" });
    await apiPost(page, "/api/credit-notes", {
      client_id: client.body.id,
      invoice_id: invoice.body.id,
      issue_date: today(),
      lines: [{ description: "Chaise", quantity: 1, unit_price: 42.74, tax_rate: 20 }],
    });
    const register = await setupRegister(page, "Caisse");
    const session = await openSession(page, register.id as string, 0);
    await apiPost(page, "/api/pos/transactions", {
      register_id: register.id,
      session_id: session.id,
      lines: [{ designation: "Café", quantity: 3, unit_price: 1.1, tax_rate: 10 }],
      payments: [{ payment_method: "CASH", amount: 3.63, cash_given: 5, change_given: 1.37 }],
    });

    const res = await page.request.get(`/api/reports/fec?year=${new Date().getFullYear()}`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-disposition"]).toContain("123456789FEC");
    const rows = Buffer.from(await res.body()).toString("latin1").split("\r\n").filter(Boolean);
    expect(rows[0].split("\t")).toHaveLength(18);

    const byEcriture = new Map<string, number>();
    const journals = new Set<string>();
    for (const row of rows.slice(1)) {
      const cols = row.split("\t");
      expect(cols).toHaveLength(18);
      const key = cols[2];
      journals.add(cols[0]);
      const cents = (s: string) => Math.round(Number(s.replace(",", ".")) * 100);
      byEcriture.set(key, (byEcriture.get(key) ?? 0) + cents(cols[11]) - cents(cols[12]));
    }
    for (const [num, diff] of byEcriture) expect(diff, `écriture ${num}`).toBe(0);
    expect([...journals].sort()).toEqual(["BQ", "CA", "VE"]);
    // Invoice, credit note, payment, till sale.
    expect(byEcriture.size).toBe(4);
  });
});
