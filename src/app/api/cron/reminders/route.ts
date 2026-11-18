import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/db";
import { sweepTenantReminders, markExpiredQuotes } from "@/lib/reminder-sweep";
import { isCronAuthorized } from "@/lib/cron-auth";
import { sendDueReminders } from "@/lib/reminder-send";

// Daily reminders job (vercel.json schedules this at 08:00). Sweeps EVERY
// tenant with the same logic as the dashboard-triggered
// /api/reminders/check-and-create route:
//   - overdue ISSUED invoices  -> pending "payment_overdue" reminder
//   - SENT quotes expiring within 7 days -> pending "quote_expiring" reminder
// and flips SENT quotes past their validity date to EXPIRED.
//
// Idempotent: a document with a pending (unsent) reminder of the same type is
// skipped, and the quote-expiry flip only matches SENT quotes.
//
// Emails go out only for tenants that turned on automatic sending
// (company_settings.auto_send_reminders) and only through the mail provider:
// everyone else keeps sending by hand from /api/reminders/[id]/send, which
// checks the user's permissions and can fall back to a mailto: draft. A
// suspended account sends nothing.

export const GET = async (req: NextRequest) => {
  if (!isCronAuthorized(req, "reminders")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Only the accounts that have something to chase: an overdue invoice, a
    // quote about to expire, or a reminder still waiting to go out. Visiting
    // every account cost several queries each, most of them for nothing, and
    // grew with every signup.
    const now = new Date();
    const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const [withOverdue, withExpiring, autoSendRows] = await Promise.all([
      prisma.invoice.findMany({
        where: { status: "ISSUED", dueDate: { lt: now } },
        distinct: ["tenantId"],
        select: { tenantId: true },
      }),
      prisma.quote.findMany({
        where: { status: "SENT", validityDate: { lte: inSevenDays, gte: now } },
        distinct: ["tenantId"],
        select: { tenantId: true },
      }),
      prisma.companySettings.findMany({
        where: { autoSendReminders: true },
        select: { tenantId: true },
      }),
    ]);
    const autoSend = new Set(autoSendRows.map((s) => s.tenantId));
    const candidates = new Set([...withOverdue, ...withExpiring].map((r) => r.tenantId));
    for (const id of autoSend) candidates.add(id);
    const tenants = await prisma.tenant.findMany({
      where: { id: { in: [...candidates] } },
      select: { id: true, status: true },
    });
    let remindersSent = 0;

    // One tenant's failure must not cost every later tenant its reminders.
    //
    // The loop is ordered by nothing in particular, so an unhandled error threw
    // away the sweep for whoever happened to come after the failing account —
    // silently, since the job answered 500 and the next run started from the
    // same place. Each tenant is now isolated, and the failures are counted and
    // reported rather than aborting the run.
    let remindersCreated = 0;
    const failed: string[] = [];
    for (const tenant of tenants) {
      try {
        const created = await sweepTenantReminders(tenant.id);
        remindersCreated += created.length;
        if (autoSend.has(tenant.id) && tenant.status !== "suspended") {
          remindersSent += (await sendDueReminders(tenant.id)).sent;
        }
      } catch (error) {
        failed.push(tenant.id);
        Sentry.captureException(error, {
          tags: { route: "/api/cron/reminders", tenantId: tenant.id },
        });
      }
    }

    // Tenant-wide in one statement (no per-tenant loop needed).
    const quotesExpired = await markExpiredQuotes();

    return NextResponse.json({
      tenants_swept: tenants.length,
      tenants_failed: failed.length,
      reminders_created: remindersCreated,
      reminders_sent: remindersSent,
      quotes_expired: quotesExpired,
    });
  } catch (error) {
    console.error("Cron reminders error:", error);
    Sentry.captureException(error, { tags: { route: "/api/cron/reminders" } });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
};
