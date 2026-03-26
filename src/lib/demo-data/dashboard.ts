import type { DashboardStats } from "@/types";
import { DEMO_INVOICES } from "./invoices";
import { DEMO_QUOTES } from "./quotes";

export const DEMO_DASHBOARD_STATS: DashboardStats = {
  total_clients: 5,
  total_invoices: 4,
  total_quotes: 3,
  revenue_this_month: 208250, // paid invoices total this month
  revenue_this_year: 208250,
  pending_payments: 74970, // issued but unpaid
  total_expenses: 73200,
  profit: 135050, // revenue - expenses
  recent_invoices: DEMO_INVOICES.slice(0, 4),
  recent_quotes: DEMO_QUOTES.slice(0, 3),
};
