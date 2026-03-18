import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withPlatformAdmin } from "@/lib/admin-api-utils";

export const GET = withPlatformAdmin(async () => {
  const subscriptions = await prisma.subscription.findMany({
    select: {
      status: true,
      plan: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  // Group by status
  const byStatus: Record<string, number> = {};
  // Group by plan and status
  const byPlan: Record<string, Record<string, number>> = {};

  for (const sub of subscriptions) {
    // By status
    byStatus[sub.status] = (byStatus[sub.status] || 0) + 1;

    // By plan
    const planKey = sub.plan.name || sub.plan.slug;
    if (!byPlan[planKey]) {
      byPlan[planKey] = {};
    }
    byPlan[planKey][sub.status] = (byPlan[planKey][sub.status] || 0) + 1;
  }

  return NextResponse.json({
    by_status: byStatus,
    by_plan: byPlan,
  });
});
