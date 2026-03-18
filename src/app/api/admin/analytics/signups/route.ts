import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withPlatformAdmin } from "@/lib/admin-api-utils";

export const GET = withPlatformAdmin(async (req) => {
  const url = new URL(req.url);
  const months = parseInt(url.searchParams.get("months") || "12", 10);

  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);

  const tenants = await prisma.tenant.findMany({
    where: { createdAt: { gte: startDate } },
    select: { createdAt: true },
  });

  // Group by month
  const monthMap: Record<string, number> = {};

  // Initialize all months
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - months + 1 + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthMap[key] = 0;
  }

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
