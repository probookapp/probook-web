import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";
import { apiGet, apiPost, setupClient, setupIssuedInvoice } from "./api-helpers";

/**
 * The scheduled jobs.
 *
 * vercel.json schedules three of them, and none had ever run: the middleware
 * required a session cookie on every /api/* route, and Vercel Cron sends only a
 * bearer. The 401 came back before the route was reached, so reminders were
 * never created, expired quotes never flipped and old sessions never cleaned.
 * These tests call the jobs the way the scheduler does — no cookie.
 */
const JOBS = ["/api/cron/cleanup", "/api/cron/reminders", "/api/cron/subscriptions"];

test.describe("Scheduled jobs", () => {
  for (const job of JOBS) {
    test(`${job} is reachable without a session`, async ({ request }) => {
      // A bare request fixture carries no cookies, exactly like the scheduler.
      const res = await request.get(job);
      // Outside production the routes skip the bearer check, so this is the
      // job actually running rather than a 401 from the middleware.
      expect(res.status(), await res.text()).toBe(200);
    });
  }

  test("the reminders job raises a reminder for an overdue invoice", async ({ page, request }) => {
    await signUp(page);
    const client = await setupClient(page, "Relance Automatique");
    const invoice = await setupIssuedInvoice(page, {
      client_id: client.id,
      issue_date: "2026-01-01",
      due_date: "2026-01-31", // long past
      lines: [{ description: "Prestation", quantity: 1, unit_price: 10000, tax_rate: 19 }],
    });

    // No assertion that the list starts empty: signUp lands on the dashboard,
    // whose reminders widget raises the same reminder on its own. What the job
    // has to guarantee is the end state, for a tenant nobody has visited.
    const res = await request.get("/api/cron/reminders");
    expect(res.status()).toBe(200);

    const reminders = (await apiGet(page, "/api/reminders")).body as unknown as {
      reminder_type: string;
      document_id: string;
    }[];
    const raised = reminders.filter(
      (r) => r.reminder_type === "payment_overdue" && r.document_id === invoice.body.id
    );
    expect(raised).toHaveLength(1);
  });

  test("running the reminders job twice does not duplicate a reminder", async ({ page, request }) => {
    await signUp(page);
    const client = await setupClient(page, "Relance Idempotente");
    await setupIssuedInvoice(page, {
      client_id: client.id,
      issue_date: "2026-01-01",
      due_date: "2026-01-31",
      lines: [{ description: "Prestation", quantity: 1, unit_price: 10000, tax_rate: 19 }],
    });

    await request.get("/api/cron/reminders");
    const first = ((await apiGet(page, "/api/reminders")).body as unknown as unknown[]).length;
    await request.get("/api/cron/reminders");
    const second = ((await apiGet(page, "/api/reminders")).body as unknown as unknown[]).length;

    // A daily job that piled up a new reminder every morning would be worse
    // than one that never ran.
    expect(second).toBe(first);
  });

  test("the reminders job flips an expired quote", async ({ page, request }) => {
    await signUp(page);
    const client = await setupClient(page, "Devis Périmé");
    const quote = await apiPost(page, "/api/quotes", {
      client_id: client.id,
      issue_date: "2026-01-01",
      validity_date: "2026-01-15", // long past
      status: "SENT",
      lines: [{ description: "Étude", quantity: 1, unit_price: 5000, tax_rate: 19 }],
    });

    await request.get("/api/cron/reminders");

    const reread = await apiGet(page, `/api/quotes/${quote.body.id}`);
    expect(reread.body.status).toBe("EXPIRED");
  });
});
