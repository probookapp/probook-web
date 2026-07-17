import { test, expect, type Page } from "@playwright/test";
import { apiGet, apiPost, setupClient } from "./api-helpers";
import { signUpSubscribed } from "./subscription-setup";

const today = () => new Date().toISOString().slice(0, 10);

/** Create + issue an invoice, returning the created invoice body. */
async function issuedInvoice(
  page: Page,
  clientId: string,
  unitPrice: number
): Promise<Record<string, unknown>> {
  const inv = await apiPost(page, "/api/invoices", {
    client_id: clientId,
    issue_date: today(),
    lines: [{ description: "Service", quantity: 1, unit_price: unitPrice, tax_rate: 0 }],
  });
  expect(inv.status).toBe(200);
  const issued = await apiPost(page, `/api/invoices/${inv.body.id}/issue`);
  expect(issued.status).toBe(200);
  return inv.body;
}

test.describe("Client statements", () => {
  test.beforeEach(async ({ page }) => {
    await signUpSubscribed(page);
  });

  test("statement ledger reflects invoices, payment and credit note (and excludes drafts)", async ({
    page,
  }) => {
    const client = await setupClient(page, "Ledger Client");

    // 2 issued invoices: 1000 + 500.
    const inv1 = await issuedInvoice(page, client.id as string, 1000);
    const inv2 = await issuedInvoice(page, client.id as string, 500);

    // 1 payment of 300 against invoice 1.
    const pay = await apiPost(page, "/api/payments", {
      invoice_id: inv1.id,
      amount: 300,
      payment_date: today(),
      payment_method: "CASH",
    });
    expect(pay.status).toBe(200);

    // 1 issued credit note of 200.
    const cn = await apiPost(page, "/api/credit-notes", {
      client_id: client.id,
      issue_date: today(),
      restock: false,
      lines: [{ description: "Goodwill credit", quantity: 1, unit_price: 200, tax_rate: 0 }],
    });
    expect(cn.status).toBe(200);

    // A DRAFT invoice that must NOT appear in the ledger.
    const draft = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: today(),
      lines: [{ description: "Draft", quantity: 1, unit_price: 9999, tax_rate: 0 }],
    });
    expect(draft.status).toBe(200);

    // ── API cross-check: exact ledger maths ──────────────────────────────────
    // debit 1000 + 500 = 1500 ; credit 300 (payment) + 200 (credit note) = 500.
    // closing balance = 1500 - 500 = 1000.
    const stmt = await apiGet(page, `/api/clients/${client.id}/statement`);
    expect(stmt.status).toBe(200);
    const totals = stmt.body.totals as Record<string, number>;
    expect(totals.total_invoiced).toBe(1500);
    expect(totals.total_paid).toBe(300);
    expect(totals.total_credited).toBe(200);
    expect(totals.closing_balance).toBe(1000);

    const entries = stmt.body.entries as Array<Record<string, unknown>>;
    // 2 invoices + 1 payment + 1 credit note = 4 entries; DRAFT excluded.
    expect(entries.length).toBe(4);
    const references = entries.map((e) => e.reference);
    expect(references).toContain(inv1.invoice_number);
    expect(references).toContain(inv2.invoice_number);
    expect(references).not.toContain(draft.body.invoice_number);
    // Last entry's running balance equals the closing balance.
    expect((entries[entries.length - 1] as Record<string, number>).running_balance).toBe(1000);

    // Outstanding balance surfaced by the clients list endpoint.
    const balances = await apiGet(page, "/api/clients/balances");
    expect(balances.status).toBe(200);
    const balanceEntry = (balances.body as unknown as Array<Record<string, unknown>>).find(
      (b) => b.client_id === client.id
    );
    expect(balanceEntry).toBeTruthy();
    expect((balanceEntry as Record<string, number>).balance).toBe(1000);

    // ── UI: clients list + statement modal ───────────────────────────────────
    await page.goto("/en/clients");
    await page.waitForLoadState("networkidle");
    // The clients list renders both a mobile card (md:hidden) and a desktop
    // table row, so a plain getByText matches the hidden mobile <p> first.
    // Target the desktop table cell, which is the visible one at this viewport.
    await expect(page.getByRole("cell", { name: "Ledger Client" })).toBeVisible();

    // The desktop "Outstanding" column shows the client's balance (1000), not "-".
    const row = page.getByRole("row").filter({ hasText: "Ledger Client" }).first();
    await expect(row).toContainText(/1[\s,.]?000/);

    // Open the statement modal via the row action.
    await row.getByRole("button", { name: "Statement" }).click();
    await expect(page.getByText("Opening balance")).toBeVisible();

    // Ledger rows: the invoice/credit-note references are listed. inv1's number
    // appears twice (its own invoice row + the payment row that references it),
    // so scope these to the first match.
    await expect(page.getByText(inv1.invoice_number as string).first()).toBeVisible();
    await expect(page.getByText(inv2.invoice_number as string).first()).toBeVisible();
    await expect(
      page.getByText(cn.body.credit_note_number as string).first()
    ).toBeVisible();

    // The DRAFT invoice number is absent from the ledger.
    await expect(page.getByText(draft.body.invoice_number as string)).toHaveCount(0);

    // Running-balance / outstanding-total structure is rendered.
    await expect(page.getByText("Outstanding balance")).toBeVisible();
    await expect(page.getByText("Total invoiced")).toBeVisible();
    await expect(page.getByText("Total paid")).toBeVisible();
    await expect(page.getByText("Total credited")).toBeVisible();
    await expect(page.getByText("Closing balance")).toBeVisible();
  });
});
