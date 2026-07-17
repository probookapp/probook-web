import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions-server";
import { prisma } from "@/lib/db";

export const GET = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "reports", "view");
  if (denied) return denied;
  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const dateFilter: { date?: { gte: Date; lt: Date } } = {};
  if (startDate && endDate) {
    dateFilter.date = {
      gte: new Date(startDate),
      lt: new Date(new Date(endDate).getTime() + 86400000), // include end date
    };
  } else {
    // Default to current year
    const year = new Date().getFullYear();
    dateFilter.date = {
      gte: new Date(year, 0, 1),
      lt: new Date(year + 1, 0, 1),
    };
  }

  const expenses = await prisma.expense.findMany({
    where: { tenantId, ...dateFilter },
  });

  const months: Record<string, { totalAmount: number; expenseCount: number }> = {};

  for (const exp of expenses) {
    const d = new Date(exp.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!months[key]) {
      months[key] = { totalAmount: 0, expenseCount: 0 };
    }
    months[key].totalAmount += exp.amount;
    months[key].expenseCount += 1;
  }

  const result = Object.entries(months)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, data]) => ({
      period,
      ...data,
    }));

  return NextResponse.json(toSnakeCase(result));
});
