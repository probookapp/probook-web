import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";

export const GET = withAuth(async (req, { tenantId }) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  // The same stretch of last month (1st to today's day), so a figure on the
  // 10th is not compared with a whole month.
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const sameDayLastMonth = new Date(
    now.getFullYear(),
    now.getMonth() - 1,
    Math.min(now.getDate(), new Date(now.getFullYear(), now.getMonth(), 0).getDate()),
    23, 59, 59, 999
  );
  // Twelve calendar months, the current one last.
  const startOfTrend = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const [clientCount, invoiceCount, quoteCount, expenses, yearlyExpenses, issuedInvoices, recentInvoices, recentQuotes] = await Promise.all([
    prisma.client.count({ where: { tenantId } }),
    prisma.invoice.count({ where: { tenantId } }),
    prisma.quote.count({ where: { tenantId } }),
    prisma.expense.aggregate({ where: { tenantId }, _sum: { amount: true } }),
    prisma.expense.aggregate({
      where: { tenantId, date: { gte: startOfYear } },
      _sum: { amount: true },
    }),
    prisma.invoice.findMany({
      where: { tenantId, status: "ISSUED" },
      include: { payments: true },
    }),
    prisma.invoice.findMany({
      where: { tenantId },
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { client: true, lines: true, payments: true },
    }),
    prisma.quote.findMany({
      where: { tenantId },
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { client: true, lines: true },
    }),
  ]);

  // Calculate revenue from PAID/ISSUED invoices
  const paidInvoicesMonth = await prisma.invoice.findMany({
    where: {
      tenantId,
      status: { in: ["PAID", "ISSUED"] },
      issueDate: { gte: startOfMonth },
    },
  });
  const revenueMonth = paidInvoicesMonth.reduce((sum, inv) => sum + num(inv.total), 0);

  const paidInvoicesYear = await prisma.invoice.findMany({
    where: {
      tenantId,
      status: { in: ["PAID", "ISSUED"] },
      issueDate: { gte: startOfYear },
    },
    include: { lines: true },
  });
  const revenueYear = paidInvoicesYear.reduce((sum, inv) => sum + num(inv.total), 0);

  // Revenue per month over the last twelve, and last month to the same day.
  const trendInvoices = await prisma.invoice.findMany({
    where: {
      tenantId,
      status: { in: ["PAID", "ISSUED"] },
      issueDate: { gte: startOfTrend },
    },
    select: { issueDate: true, total: true },
  });
  const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const revenueByMonth = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(startOfTrend.getFullYear(), startOfTrend.getMonth() + i, 1);
    return { month: monthKey(d), revenue: 0 };
  });
  const monthIndex = new Map(revenueByMonth.map((m, i) => [m.month, i]));
  let revenueLastMonthToDate = 0;
  for (const inv of trendInvoices) {
    const i = monthIndex.get(monthKey(inv.issueDate));
    if (i !== undefined) revenueByMonth[i].revenue += num(inv.total);
    if (inv.issueDate >= startOfLastMonth && inv.issueDate <= sameDayLastMonth) {
      revenueLastMonthToDate += num(inv.total);
    }
  }

  // COGS (cost of goods sold): sum of (quantity * frozen cost) across all lines of
  // PAID/ISSUED invoices issued this year. costPriceSnapshot is captured at issue time.
  const cogsYear = paidInvoicesYear.reduce((sum, inv) => {
    return (
      sum +
      inv.lines.reduce((lineSum, line) => lineSum + line.quantity * num(line.costPriceSnapshot), 0)
    );
  }, 0);

  const totalExpenses = num(expenses._sum?.amount);
  const totalExpensesYear = num(yearlyExpenses._sum?.amount);

  // What the client still owes on one invoice: the TTC total plus the stamp
  // duty snapshot, as on the invoice page, less the payments received.
  const owedOn = (inv: (typeof issuedInvoices)[number]) =>
    num(inv.total) + num(inv.stampDuty) - inv.payments.reduce((s, p) => s + num(p.amount), 0);

  // Pending payments: total owed on ISSUED invoices minus payments received
  const pendingPayments = issuedInvoices.reduce((sum, inv) => sum + owedOn(inv), 0);

  // What is still owed, by how late it is: the list an owner chases payments
  // from. Days are counted from the due date.
  const DAY = 24 * 60 * 60 * 1000;
  const receivablesAging = { not_due: 0, days_0_30: 0, days_31_60: 0, days_over_60: 0 };
  let overdueCount = 0;
  for (const inv of issuedInvoices) {
    const owed = owedOn(inv);
    if (owed <= 0) continue;
    const late = Math.floor((now.getTime() - inv.dueDate.getTime()) / DAY);
    if (late <= 0) {
      receivablesAging.not_due += owed;
      continue;
    }
    overdueCount++;
    if (late <= 30) receivablesAging.days_0_30 += owed;
    else if (late <= 60) receivablesAging.days_31_60 += owed;
    else receivablesAging.days_over_60 += owed;
  }

  // Net profit: revenue minus cost of goods sold minus operating expenses (all scoped to current year)
  const profit = revenueYear - cogsYear - totalExpensesYear;

  return NextResponse.json({
    total_clients: clientCount,
    total_invoices: invoiceCount,
    total_quotes: quoteCount,
    total_expenses: totalExpenses,
    revenue_this_month: revenueMonth,
    revenue_this_year: revenueYear,
    revenue_last_month_to_date: revenueLastMonthToDate,
    revenue_by_month: revenueByMonth,
    receivables_aging: receivablesAging,
    overdue_count: overdueCount,
    pending_payments: pendingPayments,
    profit,
    recent_invoices: toSnakeCase(recentInvoices),
    recent_quotes: toSnakeCase(recentQuotes),
  });
});
