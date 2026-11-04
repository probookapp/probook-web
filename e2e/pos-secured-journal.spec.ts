import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";
import { apiGet, apiPost, apiDelete, apiPut, setupClient, setupRegister, openSession } from "./api-helpers";
import { reloadWithFreshCache } from "./query-cache";

/**
 * The secured cash journal (src/lib/pos-journal.ts): every customer payment
 * is sealed as it is recorded, corrections are negative entries, the chain
 * verifies, and the settings screen shows it.
 */
const today = () => new Date().toISOString().slice(0, 10);

test.describe("Secured cash journal", () => {
  test("seals sales, cancellations and invoice payments in a chain that verifies", async ({ page }) => {
    await signUp(page);
    await apiPut(page, "/api/settings", { fiscal_profile: "FR" });

    const register = await setupRegister(page, "Caisse 1");
    const session = await openSession(page, register.id as string, 100);
    const sale = await apiPost(page, "/api/pos/transactions", {
      register_id: register.id,
      session_id: session.id,
      lines: [{ designation: "Café", quantity: 2, unit_price: 1.5, tax_rate: 10 }],
      payments: [{ payment_method: "CASH", amount: 3.3, cash_given: 5, change_given: 1.7 }],
    });
    expect(sale.status).toBe(200);
    const cancel = await apiPost(page, `/api/pos/transactions/${sale.body.id}/cancel`, { reason: "erreur" });
    expect(cancel.status).toBe(200);

    // An invoice payment, edited then deleted: three more entries, none rewritten.
    const client = await setupClient(page, "Client");
    const invoice = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: today(),
      lines: [{ description: "Service", quantity: 1, unit_price: 100, tax_rate: 20 }],
    });
    await apiPost(page, `/api/invoices/${invoice.body.id}/issue`);
    const payment = await apiPost(page, "/api/payments", {
      invoice_id: invoice.body.id,
      amount: 50,
      payment_date: today(),
      payment_method: "transfer",
    });
    expect(payment.status).toBe(200);
    const edited = await apiPut(page, `/api/payments/${payment.body.id}`, {
      amount: 40,
      payment_date: today(),
      payment_method: "transfer",
    });
    expect(edited.status).toBe(200);
    expect((await apiDelete(page, `/api/payments/${payment.body.id}`)).status).toBe(204);

    const status = await apiGet(page, "/api/pos/fiscal/status");
    expect(status.status).toBe(200);
    expect(status.body.chain_ok).toBe(true);
    // SALE, CANCELLATION, PAYMENT, PAYMENT_REVERSAL + PAYMENT (the edit), PAYMENT_REVERSAL (the delete).
    expect(status.body.entry_count).toBe(6);

    // Nothing finished yet to archive; the attestation waits for the publisher's identity.
    const archive = await apiGet(page, `/api/pos/fiscal/archive?period=${new Date().getFullYear()}`);
    expect(archive.status).toBe(400);

    await page.goto("/fr/settings");
    await reloadWithFreshCache(page);
    const card = page.getByRole("status").filter({ hasText: "Journal intègre" });
    await expect(card).toContainText("6 enregistrement(s) vérifié(s)");
    await expect(page.getByRole("button", { name: "Télécharger l'attestation" })).toBeVisible();
  });
});
