import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withPlatformAdmin } from "@/lib/admin-api-utils";

export const GET = withPlatformAdmin(async (req) => {
  const url = new URL(req.url);
  const months = parseInt(url.searchParams.get("months") || "12", 10);

  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);

  const invoices = await prisma.subscriptionInvoice.findMany({
    where: {
      status: "paid",
      paidAt: { gte: startDate },
    },
    select: { amount: true, paidAt: true },
  });

  // Group by month
  const monthMap: Record<string, number> = {};

  // Initialize all months
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - months + 1 + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthMap[key] = 0;
  }

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
