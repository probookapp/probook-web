import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";
import { withPlatformAdmin } from "@/lib/admin-api-utils";

export const GET = withPlatformAdmin(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const requests = await prisma.subscriptionRequest.findMany({
    where: status ? { status } : undefined,
    include: {
      tenant: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // Fetch target plan info for each request
  const planIds = [...new Set(requests.map((r) => r.targetPlanId))];
  const plans = await prisma.plan.findMany({
    where: { id: { in: planIds } },
  });
  const planMap = new Map(plans.map((p) => [p.id, p]));

  const enriched = requests.map((r) => ({
    ...r,
    targetPlan: planMap.get(r.targetPlanId) || null,
  }));

  return NextResponse.json(toSnakeCase(enriched));
});
