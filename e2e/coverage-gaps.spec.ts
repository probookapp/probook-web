import { test, expect, type Page } from "@playwright/test";
import { signUp } from "./helpers";
import {
  api,
  apiDelete,
  apiGet,
  apiPost,
  apiPut,
  setupClient,
  setupIssuedInvoice,
  setupProduct,
} from "./api-helpers";

/**
 * Routes that a coverage sweep found no test naming.
 *
 * The list was long; these are the ones where a defect costs money or data:
 * bulk deletion, document conversion and duplication, payment edits, the
 * invoice integrity chain, and reminders. The cross-tenant cases are here on
 * purpose — a destructive route that forgets its tenant scope is the worst bug
 * this application could have.
 */
const LINE = [{ description: "Prestation", quantity: 1, unit_price: 10000, tax_rate: 19 }];

async function draftInvoice(page: Page, clientId: unknown, date = "2026-06-01") {
  const res = await apiPost(page, "/api/invoices", {
    client_id: clientId,
    issue_date: date,
    lines: LINE,
  });
  expect(res.status).toBe(200);
  return res.body;
}

async function draftQuote(page: Page, clientId: unknown) {
  const res = await apiPost(page, "/api/quotes", {
    client_id: clientId,
    issue_date: "2026-06-01",
    validity_date: "2026-07-01",
    lines: LINE,
  });
  expect(res.status).toBe(200);
  return res.body;
}

test.describe("Bulk deletion", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("deletes the drafts it was given, and nothing else", async ({ page }) => {
    const client = await setupClient(page, "Suppression Groupée");
    const a = await draftInvoice(page, client.id);
    const b = await draftInvoice(page, client.id, "2026-06-02");
    const keep = await draftInvoice(page, client.id, "2026-06-03");

    const res = await apiPost(page, "/api/invoices/batch-delete", [a.id, b.id]);
    expect(res.status).toBe(200);

    expect((await apiGet(page, `/api/invoices/${a.id}`)).status).toBe(404);
    expect((await apiGet(page, `/api/invoices/${keep.id}`)).status).toBe(200);
  });

  test("refuses the whole batch when one invoice is issued", async ({ page }) => {
    const client = await setupClient(page, "Lot Bloqué");
    const draft = await draftInvoice(page, client.id);
    const issued = await setupIssuedInvoice(page, {
      client_id: client.id,
      issue_date: "2026-06-02",
      lines: LINE,
    });

    // An issued invoice belongs to the legal numbering sequence. All or
    // nothing: a partial delete would be worse than a refusal.
    const res = await apiPost(page, "/api/invoices/batch-delete", [draft.id, issued.body.id]);
    expect(res.status).toBe(409);
    expect((await apiGet(page, `/api/invoices/${draft.id}`)).status).toBe(200);
  });

  test("cannot reach another tenant's documents", async ({ page, browser }) => {
    const client = await setupClient(page, "Isolation Lot");
    const mine = await draftInvoice(page, client.id);

    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await signUp(otherPage);

    const res = await apiPost(otherPage, "/api/invoices/batch-delete", [mine.id]);
    // Whatever the status, the row must survive.
    expect([200, 404, 403, 409]).toContain(res.status);
    expect((await apiGet(page, `/api/invoices/${mine.id}`)).status).toBe(200);

    await other.close();
  });

  test("quotes, delivery notes and expenses delete in bulk too", async ({ page }) => {
    const client = await setupClient(page, "Lots Divers");
    const quote = await draftQuote(page, client.id);
    const note = await apiPost(page, "/api/delivery-notes", {
      client_id: client.id,
      issue_date: "2026-06-01",
      lines: LINE,
    });
    const expense = await apiPost(page, "/api/expenses", {
      name: "Fourniture",
      amount: 500,
      date: "2026-06-01",
    });

    expect((await apiPost(page, "/api/quotes/batch-delete", [quote.id])).status).toBe(200);
    expect((await apiPost(page, "/api/delivery-notes/batch-delete", [note.body.id])).status).toBe(200);
    expect((await apiPost(page, "/api/expenses/batch-delete", [expense.body.id])).status).toBe(200);

    expect((await apiGet(page, `/api/quotes/${quote.id}`)).status).toBe(404);
    expect((await apiGet(page, `/api/expenses/${expense.body.id}`)).status).toBe(404);
  });
});

test.describe("Converting and duplicating documents", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("a quote becomes a delivery note without losing its lines", async ({ page }) => {
    const client = await setupClient(page, "Devis Vers BL");
    const quote = await draftQuote(page, client.id);

    const res = await apiPost(page, `/api/quotes/${quote.id}/convert-to-delivery-note`);
    expect(res.status).toBe(200);
    const lines = res.body.lines as { description: string; quantity: number }[];
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(1);
  });

  test("a delivery note becomes an invoice priced from its products", async ({ page }) => {
    const client = await setupClient(page, "BL Vers Facture");
    const product = await setupProduct(page, "Caméra IP", 10000, { quantity: 20, tax_rate: 19 });
    const note = await apiPost(page, "/api/delivery-notes", {
      client_id: client.id,
      issue_date: "2026-06-01",
      lines: [{ product_id: product.id, description: "Caméra IP", quantity: 1, unit_price: 10000, tax_rate: 19 }],
    });

    const res = await apiPost(page, `/api/delivery-notes/${note.body.id}/convert-to-invoice`);
    expect(res.status).toBe(200);
    expect(res.body.invoice_number).toBeTruthy();
    expect(res.body.total).toBeCloseTo(11900, 2);
  });

  test("a delivery note it cannot price is refused, not billed at zero", async ({ page }) => {
    const client = await setupClient(page, "BL Sans Prix");
    // A delivery note line carries a quantity but no price: what is billed
    // comes from the product. A free-text line used to convert to a zero
    // invoice, silently under-billing the customer.
    const note = await apiPost(page, "/api/delivery-notes", {
      client_id: client.id,
      issue_date: "2026-06-01",
      lines: LINE,
    });

    const res = await apiPost(page, `/api/delivery-notes/${note.body.id}/convert-to-invoice`);
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toContain("Prestation");
  });

  test("a duplicate is a new draft, not a second copy of the same number", async ({ page }) => {
    const client = await setupClient(page, "Duplication");
    const invoice = await draftInvoice(page, client.id);

    const copy = await apiPost(page, `/api/invoices/${invoice.id}/duplicate`);
    expect(copy.status).toBe(200);
    expect(copy.body.id).not.toBe(invoice.id);
    // Reusing a number would break the legal sequence.
    expect(copy.body.invoice_number).not.toBe(invoice.invoice_number);
    expect(copy.body.status).toBe("DRAFT");
  });

  test("duplication does not cross tenants", async ({ page, browser }) => {
    const client = await setupClient(page, "Duplication Isolée");
    const invoice = await draftInvoice(page, client.id);

    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await signUp(otherPage);
    expect((await apiPost(otherPage, `/api/invoices/${invoice.id}/duplicate`)).status).toBe(404);
    await other.close();
  });
});

test.describe("Payments", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("editing a payment down reopens the invoice it had settled", async ({ page }) => {
    const client = await setupClient(page, "Règlement Modifié");
    const invoice = await setupIssuedInvoice(page, {
      client_id: client.id,
      issue_date: "2026-06-01",
      due_date: "2026-07-01",
      lines: LINE,
    });

    const payment = await apiPost(page, "/api/payments", {
      invoice_id: invoice.body.id,
      amount: 11900,
      payment_date: "2026-06-10",
      payment_method: "cash",
    });
    expect(payment.status).toBe(200);
    expect((await apiGet(page, `/api/invoices/${invoice.body.id}`)).body.status).toBe("PAID");

    const edited = await apiPut(page, `/api/payments/${payment.body.id}`, {
      invoice_id: invoice.body.id,
      amount: 5000,
      payment_date: "2026-06-10",
      payment_method: "cash",
    });
    expect(edited.status).toBe(200);
    // No longer fully paid: the invoice must go back to being owed.
    expect((await apiGet(page, `/api/invoices/${invoice.body.id}`)).body.status).toBe("ISSUED");
  });

  test("payments can be listed for their invoice and deleted", async ({ page }) => {
    const client = await setupClient(page, "Règlements Listés");
    const invoice = await setupIssuedInvoice(page, {
      client_id: client.id,
      issue_date: "2026-06-01",
      due_date: "2026-07-01",
      lines: LINE,
    });
    const payment = await apiPost(page, "/api/payments", {
      invoice_id: invoice.body.id,
      amount: 4000,
      payment_date: "2026-06-10",
      payment_method: "cash",
    });

    const listed = await apiGet(page, `/api/payments/by-invoice/${invoice.body.id}`);
    expect(listed.status).toBe(200);
    expect((listed.body as unknown as unknown[]).length).toBe(1);

    expect((await apiDelete(page, `/api/payments/${payment.body.id}`)).status).toBeLessThan(300);
    const after = await apiGet(page, `/api/payments/by-invoice/${invoice.body.id}`);
    expect((after.body as unknown as unknown[]).length).toBe(0);
  });

  test("a payment cannot be edited from another tenant", async ({ page, browser }) => {
    const client = await setupClient(page, "Règlement Isolé");
    const invoice = await setupIssuedInvoice(page, {
      client_id: client.id,
      issue_date: "2026-06-01",
      due_date: "2026-07-01",
      lines: LINE,
    });
    const payment = await apiPost(page, "/api/payments", {
      invoice_id: invoice.body.id,
      amount: 1000,
      payment_date: "2026-06-10",
      payment_method: "cash",
    });

    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await signUp(otherPage);
    const stolen = await api(otherPage, "DELETE", `/api/payments/${payment.body.id}`);
    expect(stolen.status).toBe(404);

    const still = await apiGet(page, `/api/payments/by-invoice/${invoice.body.id}`);
    expect((still.body as unknown as unknown[]).length).toBe(1);

    await other.close();
  });
});

test.describe("Invoice integrity", () => {
  test("an issued invoice verifies against its stored hash", async ({ page }) => {
    await signUp(page);
    const client = await setupClient(page, "Intégrité");
    const invoice = await setupIssuedInvoice(page, {
      client_id: client.id,
      issue_date: "2026-06-01",
      lines: LINE,
    });

    const res = await apiGet(page, `/api/invoices/${invoice.body.id}/verify-integrity`);
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
  });
});

test.describe("Reminders", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("a reminder can be created, listed, marked sent and deleted", async ({ page }) => {
    const client = await setupClient(page, "Relances");
    const invoice = await setupIssuedInvoice(page, {
      client_id: client.id,
      issue_date: "2026-06-01",
      due_date: "2026-06-15",
      lines: LINE,
    });

    const created = await apiPost(page, "/api/reminders", {
      reminder_type: "payment_overdue",
      document_type: "invoice",
      document_id: invoice.body.id,
      client_id: client.id,
      scheduled_date: "2026-06-20",
      message: "Relance amiable",
    });
    expect(created.status).toBe(200);

    const forDocument = await apiGet(
      page,
      `/api/reminders/by-document/invoice/${invoice.body.id}`
    );
    expect(forDocument.status).toBe(200);
    expect((forDocument.body as unknown as unknown[]).length).toBe(1);

    const sent = await apiPost(page, `/api/reminders/${created.body.id}/mark-sent`);
    expect(sent.status).toBe(200);

    expect((await apiDelete(page, `/api/reminders/${created.body.id}`)).status).toBeLessThan(300);
  });

  test("reminders do not leak between tenants", async ({ page, browser }) => {
    const client = await setupClient(page, "Relances Isolées");
    const invoice = await setupIssuedInvoice(page, {
      client_id: client.id,
      issue_date: "2026-06-01",
      due_date: "2026-06-15",
      lines: LINE,
    });
    const reminder = await apiPost(page, "/api/reminders", {
      reminder_type: "payment_overdue",
      document_type: "invoice",
      document_id: invoice.body.id,
      client_id: client.id,
      scheduled_date: "2026-06-20",
      message: "Relance",
    });

    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await signUp(otherPage);

    expect((await apiGet(otherPage, "/api/reminders")).body).toEqual([]);
    expect((await api(otherPage, "DELETE", `/api/reminders/${reminder.body.id}`)).status).toBe(404);

    await other.close();
  });
});

test.describe("Alerts", () => {
  test("the summary reports an overdue invoice", async ({ page }) => {
    await signUp(page);
    const client = await setupClient(page, "Alertes");
    await setupIssuedInvoice(page, {
      client_id: client.id,
      issue_date: "2026-01-01",
      due_date: "2026-01-31", // long past
      lines: LINE,
    });

    const res = await apiGet(page, "/api/alerts/summary");
    expect(res.status).toBe(200);
    expect(res.body.total_count).toBeGreaterThan(0);
  });
});
