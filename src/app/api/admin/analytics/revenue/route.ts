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
    select: { amount: true, currency: true, paidAt: true },
  });

  // Group by month, then by currency: invoices are billed in different
  // currencies (DZD/EUR/...) and mixed-currency amounts must never be summed
  // into a single number.
  const monthMap: Record<string, Record<string, number>> = {};
  for (const key of monthKeys) monthMap[key] = {};

  // Sum revenue per month per currency (centimes)
  for (const invoice of invoices) {
    if (invoice.paidAt) {
      const d = new Date(invoice.paidAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (key in monthMap) {
        monthMap[key][invoice.currency] =
          (monthMap[key][invoice.currency] || 0) + invoice.amount;
      }
    }
  }

  // [{ month: "2026-07", revenue: { DZD: 1600000, EUR: 29000 } }, ...]
  const result = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, revenue]) => ({ month, revenue }));

  return NextResponse.json(result);
});
