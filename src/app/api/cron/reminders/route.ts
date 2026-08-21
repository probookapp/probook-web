import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/db";
import { sweepTenantReminders, markExpiredQuotes } from "@/lib/reminder-sweep";
import { isCronAuthorized } from "@/lib/cron-auth";

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
// Deliberately does NOT send emails: sending stays user-triggered via
// /api/reminders/[id]/send, which enforces per-document permissions and falls
// back to a mailto: draft when Resend is not configured — neither of which is
// possible from a session-less cron.

export const GET = async (req: NextRequest) => {
  if (!isCronAuthorized(req, "reminders")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tenants = await prisma.tenant.findMany({ select: { id: true } });

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
      quotes_expired: quotesExpired,
    });
  } catch (error) {
    console.error("Cron reminders error:", error);
    Sentry.captureException(error, { tags: { route: "/api/cron/reminders" } });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
};
