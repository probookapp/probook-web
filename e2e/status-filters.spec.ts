import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";
import { apiGet, apiPost, setupClient, setupIssuedInvoice } from "./api-helpers";

/**
 * Filtering document lists by state.
 *
 * The filter is a server-side where clause on purpose: doing it in the browser
 * would filter only the pages already loaded, so "show me the drafts" would
 * quietly mean "the drafts among the most recent page" — an answer that looks
 * precise and is not. These tests therefore go through the API, and assert the
 * pagination envelope, not the rendered list.
 */
type Page<T> = { data: T[]; next_cursor: string | null };
const dataOf = <T,>(body: Record<string, unknown>) => (body as unknown as Page<T>).data;

test.describe("Status filters", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("invoices can be narrowed to one state, and back to all", async ({ page }) => {
    const client = await setupClient(page, "Filtre Factures");
    const line = [{ description: "Poste", quantity: 1, unit_price: 1000, tax_rate: 0 }];
    await apiPost(page, "/api/invoices", { client_id: client.id, issue_date: "2026-06-01", lines: line });
    await setupIssuedInvoice(page, {
      client_id: client.id,
      issue_date: "2026-06-02",
      lines: line,
    });

    const all = await apiGet(page, "/api/invoices?limit=50");
    expect(dataOf<{ status: string }>(all.body)).toHaveLength(2);

    const drafts = await apiGet(page, "/api/invoices?limit=50&status=DRAFT");
    const draftRows = dataOf<{ status: string }>(drafts.body);
    expect(draftRows).toHaveLength(1);
    expect(draftRows[0].status).toBe("DRAFT");

    const both = await apiGet(page, "/api/invoices?limit=50&status=DRAFT,ISSUED");
    expect(dataOf(both.body)).toHaveLength(2);

    const explicitlyAll = await apiGet(page, "/api/invoices?limit=50&status=ALL");
    expect(dataOf(explicitlyAll.body)).toHaveLength(2);
  });

  test("an unknown state returns nothing rather than everything", async ({ page }) => {
    const client = await setupClient(page, "Filtre Inconnu");
    await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: "2026-06-01",
      lines: [{ description: "Poste", quantity: 1, unit_price: 1000, tax_rate: 0 }],
    });

    // A stale bookmark must not look like an unfiltered list.
    const res = await apiGet(page, "/api/invoices?limit=50&status=NOT_A_STATUS");
    expect(res.status).toBe(200);
    expect(dataOf(res.body)).toHaveLength(0);
  });

  test("quotes filter on their own states", async ({ page }) => {
    const client = await setupClient(page, "Filtre Devis");
    const line = [{ description: "Étude", quantity: 1, unit_price: 5000, tax_rate: 19 }];
    await apiPost(page, "/api/quotes", {
      client_id: client.id,
      issue_date: "2026-06-01",
      validity_date: "2026-07-01",
      lines: line,
    });
    await apiPost(page, "/api/quotes", {
      client_id: client.id,
      issue_date: "2026-06-02",
      validity_date: "2026-07-02",
      status: "SENT",
      lines: line,
    });

    const sent = await apiGet(page, "/api/quotes?limit=50&status=SENT");
    const rows = dataOf<{ status: string }>(sent.body);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("SENT");

    // PAID belongs to invoices; a quote list must not widen because of it.
    const paid = await apiGet(page, "/api/quotes?limit=50&status=PAID");
    expect(dataOf(paid.body)).toHaveLength(0);
  });

  test("delivery notes filter on theirs", async ({ page }) => {
    const client = await setupClient(page, "Filtre Livraisons");
    const line = [{ description: "Câble", quantity: 2, unit_price: 500, tax_rate: 19 }];
    await apiPost(page, "/api/delivery-notes", {
      client_id: client.id,
      issue_date: "2026-06-01",
      lines: line,
    });
    await apiPost(page, "/api/delivery-notes", {
      client_id: client.id,
      issue_date: "2026-06-02",
      status: "DELIVERED",
      lines: line,
    });

    const delivered = await apiGet(page, "/api/delivery-notes?limit=50&status=DELIVERED");
    const rows = dataOf<{ status: string }>(delivered.body);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("DELIVERED");
  });

  test("the filter survives pagination instead of applying per page", async ({ page }) => {
    const client = await setupClient(page, "Filtre Pagination");
    const line = [{ description: "Poste", quantity: 1, unit_price: 100, tax_rate: 0 }];
    // Three drafts and two issued, then walk the filtered list two at a time.
    for (let i = 0; i < 3; i++) {
      await apiPost(page, "/api/invoices", { client_id: client.id, issue_date: "2026-06-01", lines: line });
    }
    for (let i = 0; i < 2; i++) {
      await setupIssuedInvoice(page, {
        client_id: client.id,
        issue_date: "2026-06-01",
        lines: line,
      });
    }

    let cursor: string | null = null;
    const seen: string[] = [];
    for (let guard = 0; guard < 5; guard++) {
      const url = `/api/invoices?limit=2&status=DRAFT${cursor ? `&cursor=${cursor}` : ""}`;
      const res: { body: Record<string, unknown> } = await apiGet(page, url);
      const body = res.body as unknown as Page<{ id: string; status: string }>;
      for (const row of body.data) {
        expect(row.status).toBe("DRAFT");
        seen.push(row.id);
      }
      cursor = body.next_cursor;
      if (!cursor) break;
    }
    expect(new Set(seen).size).toBe(3);
  });
});
