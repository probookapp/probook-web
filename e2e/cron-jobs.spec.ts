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

/**
 * The header Vercel Cron sends.
 *
 * These tests used to send nothing and lean on `cron-auth` waving anything
 * through outside production. That held under `next dev` and collapsed the
 * moment the suite ran against a production build — which is exactly what CI
 * does, on purpose, to exercise the strict CSP. Worse, it meant the bearer
 * check was never exercised at all: the one line standing between a public URL
 * and every tenant's reminders was covered by nothing.
 */
const asScheduler = {
  headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
};

test.describe("Scheduled jobs", () => {
  for (const job of JOBS) {
    test(`${job} is reachable without a session`, async ({ request }) => {
      // A bare request fixture carries no cookies, exactly like the scheduler —
      // only the bearer. Reaching 200 proves both halves: the middleware let a
      // cookieless request through, and the route accepted the secret.
      const res = await request.get(job, asScheduler);
      expect(res.status(), await res.text()).toBe(200);
    });
  }

  test("a wrong secret is refused wherever the check is on", async ({ request }) => {
    // `cron-auth` waves everything through when NODE_ENV is not production, so
    // under `next dev` there is nothing to assert. Detected rather than assumed:
    // if a bare call already succeeds, the check is off and the refusal cannot
    // be observed here. CI builds for production, so it runs there.
    const bare = await request.get("/api/cron/cleanup");
    test.skip(
      bare.status() === 200,
      "the server is running with the development bypass on"
    );

    const wrong = await request.get("/api/cron/cleanup", {
      headers: { Authorization: "Bearer not-the-secret" },
    });
    expect(wrong.status(), await wrong.text()).toBe(401);

    // And the real one still gets in, so the refusal is about the secret and
    // not about the route being broken.
    const right = await request.get("/api/cron/cleanup", asScheduler);
    expect(right.status(), await right.text()).toBe(200);
  });

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
    const res = await request.get("/api/cron/reminders", asScheduler);
    expect(res.status()).toBe(200);

    // The sweep isolates each tenant: one account's error used to abort the
    // loop, so whoever came after it silently got no reminders that day. The
    // job reports its casualties instead of throwing them away.
    const summary = (await res.json()) as { tenants_swept: number; tenants_failed: number };
    expect(summary.tenants_swept).toBeGreaterThan(0);
    expect(summary.tenants_failed).toBe(0);

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

    await request.get("/api/cron/reminders", asScheduler);
    const first = ((await apiGet(page, "/api/reminders")).body as unknown as unknown[]).length;
    await request.get("/api/cron/reminders", asScheduler);
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

    await request.get("/api/cron/reminders", asScheduler);

    const reread = await apiGet(page, `/api/quotes/${quote.body.id}`);
    expect(reread.body.status).toBe("EXPIRED");
  });
});
