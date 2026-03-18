import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export const GET = withAuth(async (req, { tenantId }) => {
  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const dateFilter: { issueDate?: { gte: Date; lt: Date } } = {};
  if (startDate && endDate) {
    dateFilter.issueDate = {
      gte: new Date(startDate),
      lt: new Date(new Date(endDate).getTime() + 86400000), // include end date
    };
  } else {
    // Default to current year
    const year = new Date().getFullYear();
    dateFilter.issueDate = {
      gte: new Date(year, 0, 1),
      lt: new Date(year + 1, 0, 1),
    };
  }

  const invoices = await prisma.invoice.findMany({
    where: {
      tenantId,
      status: { in: ["PAID", "ISSUED"] },
      ...dateFilter,
    },
  });

  const months: Record<string, { revenueBeforeTax: number; revenueTotal: number; invoiceCount: number }> = {};

  for (const inv of invoices) {
    const d = new Date(inv.issueDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!months[key]) {
      months[key] = { revenueBeforeTax: 0, revenueTotal: 0, invoiceCount: 0 };
    }
    months[key].revenueBeforeTax += inv.subtotal;
    months[key].revenueTotal += inv.total;
    months[key].invoiceCount += 1;
  }

  const result = Object.entries(months)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, data]) => ({
      period,
      ...data,
    }));

  return NextResponse.json(toSnakeCase(result));
});
