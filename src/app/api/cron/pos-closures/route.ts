import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/db";
import { isCronAuthorized } from "@/lib/cron-auth";
import { closePendingPeriods } from "@/lib/pos-closures";

// Nightly closures of the secured cash journal (vercel.json, 01:00 UTC, past
// local midnight in both Algiers and Paris). Only tenants with journal entries
// are visited. Each tenant is isolated: one failure must not leave the others'
// days unclosed. See src/lib/pos-closures.ts.
export const GET = async (req: NextRequest) => {
  if (!isCronAuthorized(req, "pos-closures")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenants = await prisma.posJournalEntry.findMany({
    distinct: ["tenantId"],
    select: { tenantId: true },
  });
  let closures = 0;
  const failed: string[] = [];
  for (const { tenantId } of tenants) {
    try {
      closures += await closePendingPeriods(tenantId);
    } catch (error) {
      failed.push(tenantId);
      Sentry.captureException(error, { tags: { route: "/api/cron/pos-closures", tenantId } });
    }
  }
  return NextResponse.json({ tenants: tenants.length, tenants_failed: failed.length, closures_written: closures });
};
