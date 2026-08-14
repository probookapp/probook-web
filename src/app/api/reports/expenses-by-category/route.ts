import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions-server";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";

/**
 * Spending broken down by heading over a period.
 *
 * The existing expenses report answers "how much per month"; this one answers
 * "on what" — the question that decides whether a fixed charge is worth
 * renegotiating. Expenses with no heading are reported together under a null
 * category rather than dropped, so the parts always add up to the whole.
 */
export const GET = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "reports", "view");
  if (denied) return denied;
  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const range: { gte: Date; lt: Date } =
    startDate && endDate
      ? {
          gte: new Date(startDate),
          lt: new Date(new Date(endDate).getTime() + 86400000), // include end date
        }
      : (() => {
          const year = new Date().getFullYear();
          return { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) };
        })();

  const expenses = await prisma.expense.findMany({
    where: { tenantId, date: range },
    include: { category: { select: { id: true, name: true } } },
  });

  type Bucket = { categoryId: string | null; categoryName: string | null; totalAmount: number; expenseCount: number };
  const buckets = new Map<string, Bucket>();
  let grandTotal = 0;

  for (const exp of expenses) {
    const key = exp.category?.id ?? "";
    const bucket = buckets.get(key) ?? {
      categoryId: exp.category?.id ?? null,
      categoryName: exp.category?.name ?? null,
      totalAmount: 0,
      expenseCount: 0,
    };
    const amount = num(exp.amount);
    bucket.totalAmount += amount;
    bucket.expenseCount += 1;
    grandTotal += amount;
    buckets.set(key, bucket);
  }

  // Biggest first: the point of the report is to show what dominates.
  const rows = Array.from(buckets.values())
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .map((b) => ({
      ...b,
      share: grandTotal > 0 ? (b.totalAmount / grandTotal) * 100 : 0,
    }));

  return NextResponse.json(toSnakeCase({ total: grandTotal, categories: rows }));
});
