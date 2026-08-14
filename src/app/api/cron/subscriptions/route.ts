import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/db";
import { isCronAuthorized } from "@/lib/cron-auth";

// Daily job (vercel.json schedules this at 02:00): flip active subscriptions
// whose paid period has ended to "expired". The client already treats a
// past-period active subscription as lapsed (see /api/subscription/current), so
// this only keeps the DB and admin views consistent. Tenants are left as-is
// (not suspended), so an expired tenant falls back to demo mode and can renew.

export const GET = async (req: NextRequest) => {
  if (!isCronAuthorized(req, "subscriptions")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const expired = await prisma.subscription.updateMany({
      where: { status: "active", currentPeriodEnd: { lt: now } },
      data: { status: "expired" },
    });
    return NextResponse.json({ subscriptions_expired: expired.count });
  } catch (error) {
    console.error("Cron subscription-expiry error:", error);
    Sentry.captureException(error, { tags: { route: "/api/cron/subscriptions" } });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
};
