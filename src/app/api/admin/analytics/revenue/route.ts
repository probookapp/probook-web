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

  const invoices = await prisma.subscriptionInvoice.findMany({
    where: {
      status: "paid",
      paidAt: { gte: rangeStart, lt: rangeEnd },
    },
    select: { amount: true, paidAt: true },
  });

  // Group by month
  const monthMap: Record<string, number> = {};
  for (const key of monthKeys) monthMap[key] = 0;

  // Sum revenue per month
  for (const invoice of invoices) {
    if (invoice.paidAt) {
      const d = new Date(invoice.paidAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (key in monthMap) {
        monthMap[key] += invoice.amount;
      }
    }
  }

  const result = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, revenue]) => ({ month, revenue }));

  return NextResponse.json(result);
});
