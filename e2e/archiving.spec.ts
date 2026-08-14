import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";
import { api, apiDelete, apiGet, apiPost, setupClient, setupIssuedInvoice } from "./api-helpers";

/**
 * Archiving.
 *
 * The whole point is that it is a filing gesture, not an accounting one: a
 * document that has been put away keeps its number, its status and its amounts,
 * and keeps counting in the VAT return and the accounting export. It only stops
 * crowding the working list.
 */
type Page<T> = { data: T[]; next_cursor: string | null };
const dataOf = <T,>(body: Record<string, unknown>) => (body as unknown as Page<T>).data;

const LINE = [{ description: "Prestation", quantity: 1, unit_price: 10000, tax_rate: 19 }];

test.describe("Archiving", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("an archived invoice leaves the working list and comes back on request", async ({ page }) => {
    const client = await setupClient(page, "Archivage SARL");
    const invoice = await setupIssuedInvoice(page, {
      client_id: client.id,
      issue_date: "2026-06-01",
      lines: LINE,
    });
    const id = invoice.body.id as string;

    const archived = await apiPost(page, `/api/invoices/${id}/archive`);
    expect(archived.status).toBe(200);
    expect(archived.body.archived_at).toBeTruthy();
    // Archiving is filing, not a state change.
    expect(archived.body.status).toBe("ISSUED");

    expect(dataOf(await (await apiGet(page, "/api/invoices?limit=50")).body)).toHaveLength(0);
    expect(dataOf(await (await apiGet(page, "/api/invoices?limit=50&archived=true")).body)).toHaveLength(1);
    expect(dataOf(await (await apiGet(page, "/api/invoices?limit=50&archived=all")).body)).toHaveLength(1);

    const restored = await apiDelete(page, `/api/invoices/${id}/archive`);
    expect(restored.status).toBe(200);
    expect(dataOf(await (await apiGet(page, "/api/invoices?limit=50")).body)).toHaveLength(1);
  });

  test("archiving twice is the same as archiving once", async ({ page }) => {
    const client = await setupClient(page, "Idempotent");
    const invoice = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: "2026-06-01",
      lines: LINE,
    });
    const id = invoice.body.id as string;

    // An offline replay or a double click must not become an error the user has
    // to think about.
    expect((await apiPost(page, `/api/invoices/${id}/archive`)).status).toBe(200);
    expect((await apiPost(page, `/api/invoices/${id}/archive`)).status).toBe(200);
    expect((await apiDelete(page, `/api/invoices/${id}/archive`)).status).toBe(200);
    expect((await apiDelete(page, `/api/invoices/${id}/archive`)).status).toBe(200);
  });

  test("an archived invoice is still declared", async ({ page }) => {
    const client = await setupClient(page, "Toujours Déclarée");
    const invoice = await setupIssuedInvoice(page, {
      client_id: client.id,
      issue_date: "2026-06-01",
      lines: LINE,
    });
    await apiPost(page, `/api/invoices/${invoice.body.id}/archive`);

    const range = "?startDate=2026-01-01&endDate=2026-12-31";
    const tax = await apiGet(page, `/api/reports/tax-summary${range}`);
    const sales = tax.body.sales as { total_ht: number; total_vat: number };
    // Tidying a list is not a fiscal event.
    expect(sales.total_ht).toBeCloseTo(10000, 2);
    expect(sales.total_vat).toBeCloseTo(1900, 2);

    const ledger = await apiGet(page, `/api/reports/accounting-export${range}`);
    expect((ledger.body.sales as unknown[]).length).toBe(1);
  });

  test("quotes archive the same way", async ({ page }) => {
    const client = await setupClient(page, "Devis Archivé");
    const quote = await apiPost(page, "/api/quotes", {
      client_id: client.id,
      issue_date: "2026-06-01",
      validity_date: "2026-07-01",
      lines: LINE,
    });

    await apiPost(page, `/api/quotes/${quote.body.id}/archive`);
    expect(dataOf(await (await apiGet(page, "/api/quotes?limit=50")).body)).toHaveLength(0);
    expect(dataOf(await (await apiGet(page, "/api/quotes?limit=50&archived=true")).body)).toHaveLength(1);
  });

  test("the state filter still applies inside the archive", async ({ page }) => {
    const client = await setupClient(page, "Archive Filtrée");
    const draft = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: "2026-06-01",
      lines: LINE,
    });
    const issued = await setupIssuedInvoice(page, {
      client_id: client.id,
      issue_date: "2026-06-02",
      lines: LINE,
    });
    await apiPost(page, `/api/invoices/${draft.body.id}/archive`);
    await apiPost(page, `/api/invoices/${issued.body.id}/archive`);

    const res = await apiGet(page, "/api/invoices?limit=50&archived=true&status=ISSUED");
    const rows = dataOf<{ status: string }>(res.body);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("ISSUED");
  });

  test("a document cannot be archived across tenants", async ({ page, browser }) => {
    const client = await setupClient(page, "Isolation");
    const invoice = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: "2026-06-01",
      lines: LINE,
    });

    const otherContext = await browser.newContext();
    const otherPage = await otherContext.newPage();
    await signUp(otherPage);

    expect((await apiPost(otherPage, `/api/invoices/${invoice.body.id}/archive`)).status).toBe(404);
    expect((await api(otherPage, "DELETE", `/api/invoices/${invoice.body.id}/archive`)).status).toBe(404);

    // Untouched for its owner.
    const reread = await apiGet(page, `/api/invoices/${invoice.body.id}`);
    expect(reread.body.archived_at).toBeFalsy();

    await otherContext.close();
  });
});
