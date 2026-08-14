import type { DashboardStats } from "@/types";
import { DEMO_CLIENTS } from "./clients";
import { DEMO_INVOICES } from "./invoices";
import { DEMO_QUOTES } from "./quotes";
import { DEMO_EXPENSES } from "./expenses";

/**
 * Derived from the demo lists rather than written out.
 *
 * The figures used to be hand-maintained and had already drifted from the
 * documents behind them — a dashboard that disagrees with its own lists is the
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

export const DEMO_DASHBOARD_STATS: DashboardStats = {
  total_clients: DEMO_CLIENTS.length,
  total_invoices: DEMO_INVOICES.length,
  total_quotes: DEMO_QUOTES.length,
  revenue_this_month: paidRevenue,
  revenue_this_year: paidRevenue,
  pending_payments: pendingPayments,
  total_expenses: totalExpenses,
  profit: paidRevenue - totalExpenses,
  recent_invoices: DEMO_INVOICES.slice(0, 4),
  recent_quotes: DEMO_QUOTES.slice(0, 3),
};
