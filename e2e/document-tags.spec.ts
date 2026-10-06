import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";
import {
  apiDelete,
  apiGet,
  apiPost,
  apiPut,
  setupClient,
  setupIssuedInvoice,
} from "./api-helpers";

/**
 * Free labels on sales documents, and the refusal that is a state rather than a
 * label.
 *
 * These two answer one request — "can we add our own statuses?" — and the whole
 * point is that they answer it in different places. A label is free and inert: a
 * business invents as many as it likes and none of them changes what a document
 * is or what the automations do with it. A state is fixed and load-bearing: the
 * expiry sweep, the relance alerts, the conversion to an invoice and the
 * conversion-rate report all read it, which is exactly why REFUSED had to be
 * added to the list instead of being left to the user to invent.
 */
type Page<T> = { data: T[]; next_cursor: string | null };
const dataOf = <T,>(body: Record<string, unknown>) => (body as unknown as Page<T>).data;

interface TagRow {
  id: string;
  name: string;
  color: string;
}

interface QuoteRow {
  id: string;
  status: string;
  quote_number: string;
  tags?: TagRow[];
}

const LINE = [{ description: "Prestation", quantity: 1, unit_price: 10000, tax_rate: 0 }];

async function aTag(page: import("@playwright/test").Page, name: string, color = "blue") {
  const res = await apiPost(page, "/api/tags", { name, color });
  expect(res.status).toBe(200);
  return res.body as unknown as TagRow;
}

test.describe("Document labels", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("a label is created, renamed, and retired without touching its quotes", async ({ page }) => {
    const client = await setupClient(page, "Étiquettes SARL");
    const tag = await aTag(page, "Chantier Hydra");

    const created = await apiPost(page, "/api/quotes", {
      client_id: client.id,
      issue_date: "2026-06-01",
      validity_date: "2026-07-01",
      lines: LINE,
      tag_ids: [tag.id],
    });
    expect(created.status).toBe(200);
    const quote = created.body as unknown as QuoteRow;
    // Flattened to the labels themselves, not the join rows.
    expect(quote.tags?.map((row) => row.name)).toEqual(["Chantier Hydra"]);

    const renamed = await apiPut(page, `/api/tags/${tag.id}`, {
      name: "Chantier Hydra 2",
      color: "red",
    });
    expect(renamed.status).toBe(200);
    const afterRename = await apiGet(page, `/api/quotes/${quote.id}`);
    expect((afterRename.body as unknown as QuoteRow).tags?.[0]).toMatchObject({
      name: "Chantier Hydra 2",
      color: "red",
    });

    // Retiring a label is safe precisely because it carried nothing: the quote
    // keeps its number, its state and its totals, and simply wears one fewer
    // word. This is the difference that makes free labels offerable at all.
    expect((await apiDelete(page, `/api/tags/${tag.id}`)).status).toBe(204);
    const afterDelete = await apiGet(page, `/api/quotes/${quote.id}`);
    expect(afterDelete.status).toBe(200);
    const survivor = afterDelete.body as unknown as QuoteRow;
    expect(survivor.tags).toEqual([]);
    expect(survivor.quote_number).toBe(quote.quote_number);
  });

  test("the same name twice is one label, whatever the case", async ({ page }) => {
    const first = await aTag(page, "Prioritaire");
    const again = await apiPost(page, "/api/tags", { name: "prioritaire", color: "red" });
    expect(again.status).toBe(200);
    // The existing label, not a second one: two labels the user believes are
    // one would split every filter in two.
    expect((again.body as unknown as TagRow).id).toBe(first.id);
    expect(dataOf<TagRow>({ data: (await apiGet(page, "/api/tags")).body })).toBeDefined();
    const all = (await apiGet(page, "/api/tags")).body as unknown as TagRow[];
    expect(all).toHaveLength(1);
  });

  test("renaming one label onto another is refused", async ({ page }) => {
    await aTag(page, "Chantier Hydra");
    const second = await aTag(page, "Prioritaire");
    const clash = await apiPut(page, `/api/tags/${second.id}`, {
      name: "chantier hydra",
      color: "blue",
    });
    expect(clash.status).toBe(409);
  });

  test("a label narrows the list on top of the state, not instead of it", async ({ page }) => {
    const client = await setupClient(page, "Filtre Étiquettes");
    const site = await aTag(page, "Chantier Hydra");
    const urgent = await aTag(page, "Prioritaire", "red");

    const make = (status: string, tagIds: string[]) =>
      apiPost(page, "/api/quotes", {
        client_id: client.id,
        issue_date: "2026-06-01",
        validity_date: "2026-07-01",
        status,
        lines: LINE,
        tag_ids: tagIds,
      });

    await make("SENT", [site.id]);
    await make("ACCEPTED", [site.id, urgent.id]);
    await make("ACCEPTED", []);

    const bySite = await apiGet(page, `/api/quotes?limit=50&tag=${site.id}`);
    expect(dataOf<QuoteRow>(bySite.body)).toHaveLength(2);

    // The two axes combine: "the accepted ones on the Hydra site" is one query.
    const accepted = await apiGet(page, `/api/quotes?limit=50&status=ACCEPTED&tag=${site.id}`);
    const rows = dataOf<QuoteRow>(accepted.body);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("ACCEPTED");

    // A label that no longer exists narrows the list to nothing rather than
    // quietly returning everything — the same answer a stale state bookmark gets.
    const gone = await apiGet(page, "/api/quotes?limit=50&tag=00000000-0000-0000-0000-000000000000");
    expect(dataOf<QuoteRow>(gone.body)).toHaveLength(0);
  });

  test("a label from another business is dropped, not attached", async ({ page, browser }) => {
    const client = await setupClient(page, "Isolation Étiquettes");

    // A second tenant, with a label of its own.
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await signUp(otherPage);
    const foreign = await aTag(otherPage, "Chantier Voisin");
    await other.close();

    const created = await apiPost(page, "/api/quotes", {
      client_id: client.id,
      issue_date: "2026-06-01",
      validity_date: "2026-07-01",
      lines: LINE,
      tag_ids: [foreign.id],
    });
    expect(created.status).toBe(200);
    expect((created.body as unknown as QuoteRow).tags).toEqual([]);
  });

  test("the labels follow a duplicated quote", async ({ page }) => {
    const client = await setupClient(page, "Duplication Étiquettes");
    const tag = await aTag(page, "Chantier Hydra");
    const original = (
      await apiPost(page, "/api/quotes", {
        client_id: client.id,
        issue_date: "2026-06-01",
        validity_date: "2026-07-01",
        lines: LINE,
        tag_ids: [tag.id],
      })
    ).body as unknown as QuoteRow;

    const copy = await apiPost(page, `/api/quotes/${original.id}/duplicate`);
    expect(copy.status).toBe(200);
    const duplicate = copy.body as unknown as QuoteRow;
    expect(duplicate.id).not.toBe(original.id);
    expect(duplicate.tags?.map((row) => row.name)).toEqual(["Chantier Hydra"]);
  });

  test("an empty list clears the labels, an absent one leaves them alone", async ({ page }) => {
    const client = await setupClient(page, "Mise À Jour Étiquettes");
    const tag = await aTag(page, "Chantier Hydra");
    const quote = (
      await apiPost(page, "/api/quotes", {
        client_id: client.id,
        issue_date: "2026-06-01",
        validity_date: "2026-07-01",
        lines: LINE,
        tag_ids: [tag.id],
      })
    ).body as unknown as QuoteRow;

    const body = {
      client_id: client.id,
      issue_date: "2026-06-01",
      validity_date: "2026-07-01",
      status: "SENT",
      lines: LINE,
    };

    // No tag_ids at all: an older client, or an offline mutation queued before
    // labels existed. It must not silently strip them.
    const untouched = await apiPut(page, `/api/quotes/${quote.id}`, body);
    expect((untouched.body as unknown as QuoteRow).tags?.map((r) => r.name)).toEqual([
      "Chantier Hydra",
    ]);

    const cleared = await apiPut(page, `/api/quotes/${quote.id}`, { ...body, tag_ids: [] });
    expect((cleared.body as unknown as QuoteRow).tags).toEqual([]);
  });

  test("the same label reaches an invoice and a delivery note", async ({ page }) => {
    const client = await setupClient(page, "Trois Documents");
    const tag = await aTag(page, "Chantier Hydra");

    const invoice = (
      await apiPost(page, "/api/invoices", {
        client_id: client.id,
        issue_date: "2026-06-01",
        lines: LINE,
        tag_ids: [tag.id],
      })
    ).body as unknown as QuoteRow;
    expect(invoice.tags?.map((row) => row.name)).toEqual(["Chantier Hydra"]);

    const note = (
      await apiPost(page, "/api/delivery-notes", {
        client_id: client.id,
        issue_date: "2026-06-01",
        lines: [{ description: "Livraison", quantity: 1, unit: "unit" }],
        tag_ids: [tag.id],
      })
    ).body as unknown as QuoteRow;
    expect(note.tags?.map((row) => row.name)).toEqual(["Chantier Hydra"]);

    // One vocabulary: the label the invoice wears is the same row the quote
    // list filters on, not a copy of the word.
    for (const [path, id] of [
      ["invoices", invoice.id],
      ["delivery-notes", note.id],
    ] as const) {
      const filtered = await apiGet(page, `/api/${path}?limit=50&tag=${tag.id}`);
      expect(dataOf<QuoteRow>(filtered.body).map((row) => row.id)).toEqual([id]);
    }
  });

  test("an issued invoice can still be labelled, though it cannot be edited", async ({ page }) => {
    const client = await setupClient(page, "Facture Émise");
    const tag = await aTag(page, "Prioritaire", "red");
    const issued = (
      await setupIssuedInvoice(page, { client_id: client.id, issue_date: "2026-06-01", lines: LINE })
    ).body as unknown as QuoteRow;
    expect(issued.status).toBe("ISSUED");

    // This is why labels have their own endpoint. Issuing froze the document —
    // its update route accepts nothing but a draft, because issuing snapshots
    // the integrity hash, the stamp duty and the stock. A label is none of
    // those, and an invoice you cannot file is an invoice you cannot find.
    const labelled = await apiPut(page, `/api/invoices/${issued.id}/tags`, {
      tag_ids: [tag.id],
    });
    expect(labelled.status).toBe(200);
    expect((labelled.body as unknown as { tags: TagRow[] }).tags.map((r) => r.name)).toEqual([
      "Prioritaire",
    ]);

    const reread = (await apiGet(page, `/api/invoices/${issued.id}`)).body as unknown as QuoteRow;
    expect(reread.tags?.map((row) => row.name)).toEqual(["Prioritaire"]);
    // And nothing else about it moved.
    expect(reread.status).toBe("ISSUED");
  });

  test("the tags endpoint replaces the set, and refuses another business's document", async ({
    page,
    browser,
  }) => {
    const client = await setupClient(page, "Remplacement Étiquettes");
    const first = await aTag(page, "Chantier Hydra");
    const second = await aTag(page, "Prioritaire", "red");
    const quote = (
      await apiPost(page, "/api/quotes", {
        client_id: client.id,
        issue_date: "2026-06-01",
        validity_date: "2026-07-01",
        lines: LINE,
        tag_ids: [first.id],
      })
    ).body as unknown as QuoteRow;

    // The picker sends the whole set it is showing, so this replaces rather
    // than merges: the label just unticked has to disappear.
    const replaced = await apiPut(page, `/api/quotes/${quote.id}/tags`, {
      tag_ids: [second.id],
    });
    expect(
      (replaced.body as unknown as { tags: TagRow[] }).tags.map((r) => r.name)
    ).toEqual(["Prioritaire"]);

    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await signUp(otherPage);
    const foreign = await apiPut(otherPage, `/api/quotes/${quote.id}/tags`, { tag_ids: [] });
    // Not a silent cross-tenant write, and not a 500 either.
    expect(foreign.status).toBe(404);
    await other.close();

    const untouched = (await apiGet(page, `/api/quotes/${quote.id}`)).body as unknown as QuoteRow;
    expect(untouched.tags?.map((row) => row.name)).toEqual(["Prioritaire"]);
  });

  test("the labels follow a quote into its invoice and its delivery note", async ({ page }) => {
    const client = await setupClient(page, "Conversion Étiquettes");
    const tag = await aTag(page, "Chantier Hydra");
    const quote = (
      await apiPost(page, "/api/quotes", {
        client_id: client.id,
        issue_date: "2026-06-01",
        validity_date: "2026-07-01",
        status: "ACCEPTED",
        lines: LINE,
        tag_ids: [tag.id],
      })
    ).body as unknown as QuoteRow;

    const note = await apiPost(page, `/api/quotes/${quote.id}/convert-to-delivery-note`);
    expect(note.status).toBe(200);
    expect((note.body as unknown as QuoteRow).tags?.map((r) => r.name)).toEqual([
      "Chantier Hydra",
    ]);

    const invoice = await apiPost(page, `/api/quotes/${quote.id}/convert-to-invoice`);
    expect(invoice.status).toBe(200);
    expect((invoice.body as unknown as QuoteRow).tags?.map((r) => r.name)).toEqual([
      "Chantier Hydra",
    ]);
  });

  test("a label survives pagination instead of applying per page", async ({ page }) => {
    const client = await setupClient(page, "Pagination Étiquettes");
    const tag = await aTag(page, "Chantier Hydra");
    // Three labelled quotes and two without, then walk the filtered list two at
    // a time. The quotes list had no multi-page test at all, which is how a
    // dropped cursor line once left the whole suite green while infinite scroll
    // would have looped on page one forever.
    for (let i = 0; i < 3; i++) {
      await apiPost(page, "/api/quotes", {
        client_id: client.id,
        issue_date: "2026-06-01",
        validity_date: "2026-07-01",
        lines: LINE,
        tag_ids: [tag.id],
      });
    }
    for (let i = 0; i < 2; i++) {
      await apiPost(page, "/api/quotes", {
        client_id: client.id,
        issue_date: "2026-06-01",
        validity_date: "2026-07-01",
        lines: LINE,
      });
    }

    let cursor: string | null = null;
    const seen: string[] = [];
    for (let guard = 0; guard < 5; guard++) {
      const url = `/api/quotes?limit=2&tag=${tag.id}${cursor ? `&cursor=${cursor}` : ""}`;
      const res: { body: Record<string, unknown> } = await apiGet(page, url);
      const body = res.body as unknown as Page<QuoteRow>;
      for (const row of body.data) {
        expect(row.tags?.map((t) => t.id)).toContain(tag.id);
        seen.push(row.id);
      }
      cursor = body.next_cursor;
      if (!cursor) break;
    }
    // Three distinct quotes, not the same page three times and not all five.
    expect(new Set(seen).size).toBe(3);
  });
});

test.describe("A refused quote", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("stops being chased, where the same dates in SENT would be", async ({ page }) => {
    const client = await setupClient(page, "Refus SARL");
    const past = {
      client_id: client.id,
      issue_date: "2026-01-01",
      // Validity long past: in SENT this is exactly what raises the "quote
      // expired" alert on the dashboard. A refusal is an answer, so it must not.
      validity_date: "2026-01-31",
      lines: LINE,
    };

    const refused = (await apiPost(page, "/api/quotes", { ...past, status: "REFUSED" }))
      .body as unknown as QuoteRow;
    const sent = (await apiPost(page, "/api/quotes", { ...past, status: "SENT" }))
      .body as unknown as QuoteRow;

    const alerts = (await apiGet(page, "/api/alerts/summary")).body as unknown as {
      expiring_quotes: { document_id: string }[];
      expired_quotes: { document_id: string }[];
    };
    const flagged = [...alerts.expiring_quotes, ...alerts.expired_quotes].map(
      (a) => a.document_id
    );
    expect(flagged).not.toContain(refused.id);
    // The control: the same dates in SENT are flagged, so this is proving the
    // state is excluded and not that the dashboard has nothing to say.
    expect(flagged).toContain(sent.id);

    // The sweep that flips a lapsed quote is the scheduled job; that it skips a
    // refusal is covered beside the sweep itself, in e2e/cron-jobs.spec.ts.
  });

  test("is counted apart from the quotes nobody answered", async ({ page }) => {
    const client = await setupClient(page, "Conversion SARL");
    const base = {
      client_id: client.id,
      issue_date: "2026-06-01",
      validity_date: "2026-07-01",
      lines: LINE,
    };
    await apiPost(page, "/api/quotes", { ...base, status: "ACCEPTED" });
    await apiPost(page, "/api/quotes", { ...base, status: "REFUSED" });
    await apiPost(page, "/api/quotes", { ...base, status: "SENT" });

    const report = (
      await apiGet(page, "/api/reports/quote-conversion?startDate=2026-01-01&endDate=2026-12-31")
    ).body as unknown as {
      total_quotes: number;
      converted_quotes: number;
      refused_quotes: number;
    };
    expect(report.total_quotes).toBe(3);
    expect(report.converted_quotes).toBe(1);
    // The gap between quoted and won, split: one said no, one never answered.
    expect(report.refused_quotes).toBe(1);
  });
});
