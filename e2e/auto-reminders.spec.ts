import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";
import { apiGet, apiPost, apiPut } from "./api-helpers";

/**
 * Payment reminders (src/lib/reminder-sweep.ts, src/lib/reminder-send.ts):
 * the nightly job emails due reminders by itself for an account that turned
 * automatic sending on, and the next one waits for the next step.
 */
const asScheduler = { headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` } };
const daysAgo =(n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

test.describe("Automatic payment reminders", () => {
  test("the nightly job sends due reminders and waits for the next step", async ({ page }) => {
    await signUp(page);
    const saved = await apiPut(page, "/api/settings", { reminder_steps: "30, 1 ,15", auto_send_reminders: true });
    expect(saved.body.reminder_steps).toBe("1,15,30");
    expect(saved.body.auto_send_reminders).toBe(true);

    const client = await apiPost(page, "/api/clients", { name: "Client", email: "client@example.com" });
    const invoice = await apiPost(page, "/api/invoices", {
      client_id: client.body.id,
      issue_date: daysAgo(10),
      due_date: daysAgo(3),
      lines: [{ description: "Service", quantity: 1, unit_price: 100, tax_rate: 20 }],
    });
    await apiPost(page, `/api/invoices/${invoice.body.id}/issue`);

    // The scheduler's bearer: CI runs a production build, where the job
    // refuses a call without it. The test env logs emails instead of sending.
    const run = await page.request.get("/api/cron/reminders", asScheduler);
    expect(run.status()).toBe(200);
    expect((await run.json()).reminders_sent).toBeGreaterThanOrEqual(1);

    const reminders = await apiGet(page, `/api/reminders/by-document/invoice/${invoice.body.id}`);
    const list = (Array.isArray(reminders.body) ? reminders.body : reminders.body.data ?? []) as Array<{ sent_at: string | null }>;
    expect(list).toHaveLength(1);
    expect(list[0].sent_at).not.toBeNull();

    // Three days late, one sent: the second waits for day 15.
    await page.request.get("/api/cron/reminders", asScheduler);
    const after = await apiGet(page, `/api/reminders/by-document/invoice/${invoice.body.id}`);
    const again = (Array.isArray(after.body) ? after.body : after.body.data ?? []) as unknown[];
    expect(again).toHaveLength(1);
  });
});
