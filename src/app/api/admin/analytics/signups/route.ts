import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withPlatformAdmin } from "@/lib/admin-api-utils";
import { resolveMonthRange } from "@/lib/admin-analytics-range";

export const GET = withPlatformAdmin(async (req) => {
  const url = new URL(req.url);
  const { rangeStart, rangeEnd, monthKeys } = resolveMonthRange(
    url.searchParams.get("startDate"),
    url.searchParams.get("endDate"),
    url.searchParams.get("months")
  );

  const tenants = await prisma.tenant.findMany({
    where: { createdAt: { gte: rangeStart, lt: rangeEnd } },
    select: { createdAt: true },
  });

  // Group by month
  const monthMap: Record<string, number> = {};
  for (const key of monthKeys) monthMap[key] = 0;

  // Count tenants per month
  for (const tenant of tenants) {
    const d = new Date(tenant.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (key in monthMap) {
      monthMap[key]++;
    }
  }

  const result = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));

  return NextResponse.json(result);
});
