import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/db";
import { sweepTenantReminders, markExpiredQuotes } from "@/lib/reminder-sweep";

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

// Vercel Cron invokes this with "Authorization: Bearer ${CRON_SECRET}" when
// CRON_SECRET is set. Outside production the check is skipped so the job can
// be exercised locally.
function isAuthorized(req: NextRequest): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

export const GET = async (req: NextRequest) => {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tenants = await prisma.tenant.findMany({ select: { id: true } });

    let remindersCreated = 0;
    for (const tenant of tenants) {
      const created = await sweepTenantReminders(tenant.id);
      remindersCreated += created.length;
    }

    // Tenant-wide in one statement (no per-tenant loop needed).
    const quotesExpired = await markExpiredQuotes();

    return NextResponse.json({
      tenants_swept: tenants.length,
      reminders_created: remindersCreated,
      quotes_expired: quotesExpired,
    });
  } catch (error) {
    console.error("Cron reminders error:", error);
    Sentry.captureException(error, { tags: { route: "/api/cron/reminders" } });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
};
