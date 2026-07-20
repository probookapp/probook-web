import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";

export const GET = withAuth(async (req, { tenantId }) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);

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

  // Pending payments: total owed on ISSUED invoices minus payments received
  const pendingPayments = issuedInvoices.reduce((sum, inv) => {
    const paid = inv.payments.reduce((s, p) => s + num(p.amount), 0);
    return sum + (num(inv.total) - paid);
  }, 0);

  // Net profit: revenue − cost of goods sold − operating expenses (all scoped to current year)
  const profit = revenueYear - cogsYear - totalExpensesYear;

  return NextResponse.json({
    total_clients: clientCount,
    total_invoices: invoiceCount,
    total_quotes: quoteCount,
    total_expenses: totalExpenses,
    revenue_this_month: revenueMonth,
    revenue_this_year: revenueYear,
    pending_payments: pendingPayments,
    profit,
    recent_invoices: toSnakeCase(recentInvoices),
    recent_quotes: toSnakeCase(recentQuotes),
  });
});
