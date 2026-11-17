import type { DashboardStats } from "@/types";
import { DEMO_CLIENTS } from "./clients";
import { DEMO_INVOICES } from "./invoices";
import { DEMO_QUOTES } from "./quotes";
import { DEMO_EXPENSES } from "./expenses";

/**
 * Derived from the demo lists rather than written out.
 *
 * The figures used to be hand-maintained and had already drifted from the
 * documents behind them: a dashboard that disagrees with its own lists is the
 * first thing a prospect spots.
 */
const paidRevenue = DEMO_INVOICES.filter((i) => i.status === "PAID").reduce(
  (sum, i) => sum + i.total,
  0
);

/** Issued but not settled: what the "pending payments" card links to. */
const pendingPayments = DEMO_INVOICES.filter((i) => i.status === "ISSUED").reduce(
  (sum, i) => sum + i.total - (i.payments ?? []).reduce((paid, p) => paid + p.amount, 0),
  0
);

const totalExpenses = DEMO_EXPENSES.reduce((sum, e) => sum + e.amount, 0);

const billed = DEMO_INVOICES.filter((i) => i.status === "PAID" || i.status === "ISSUED");
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const now = new Date();

/** Twelve months ending this one, from the demo invoices' issue dates. */
const revenueByMonth = Array.from({ length: 12 }, (_, i) => {
  const month = monthKey(new Date(now.getFullYear(), now.getMonth() - 11 + i, 1));
  const revenue = billed
    .filter((inv) => inv.issue_date && monthKey(new Date(inv.issue_date)) === month)
    .reduce((sum, inv) => sum + inv.total, 0);
  return { month, revenue };
});

/** Same buckets as the API: days past the due date of what is still owed. */
const DAY = 24 * 60 * 60 * 1000;
const receivablesAging = { not_due: 0, days_0_30: 0, days_31_60: 0, days_over_60: 0 };
let overdueCount = 0;
for (const inv of DEMO_INVOICES.filter((i) => i.status === "ISSUED")) {
  const owed = inv.total - (inv.payments ?? []).reduce((paid, p) => paid + p.amount, 0);
  if (owed <= 0) continue;
  const late = inv.due_date ? Math.floor((now.getTime() - new Date(inv.due_date).getTime()) / DAY) : 0;
  if (late <= 0) receivablesAging.not_due += owed;
  else {
    overdueCount++;
    if (late <= 30) receivablesAging.days_0_30 += owed;
    else if (late <= 60) receivablesAging.days_31_60 += owed;
    else receivablesAging.days_over_60 += owed;
  }
}

export const DEMO_DASHBOARD_STATS: DashboardStats = {
  total_clients: DEMO_CLIENTS.length,
  total_invoices: DEMO_INVOICES.length,
  total_quotes: DEMO_QUOTES.length,
  revenue_this_month: paidRevenue,
  revenue_this_year: paidRevenue,
  revenue_last_month_to_date: revenueByMonth[10].revenue,
  revenue_by_month: revenueByMonth,
  receivables_aging: receivablesAging,
  overdue_count: overdueCount,
  pending_payments: pendingPayments,
  total_expenses: totalExpenses,
  profit: paidRevenue - totalExpenses,
  recent_invoices: DEMO_INVOICES.slice(0, 4),
  recent_quotes: DEMO_QUOTES.slice(0, 3),
};
