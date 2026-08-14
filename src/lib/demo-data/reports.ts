import type {
  RevenueByPeriod,
  RevenueByClient,
  ProductSales,
  OutstandingPayment,
  ExpensesByCategoryReport,
  ExpenseReportEntry,
  PipelineReport,
} from "@/types";
import { DEMO_EXPENSES } from "./expenses";
import { DEMO_QUOTES } from "./quotes";
import { DEMO_INVOICES } from "./invoices";
import { DEMO_DELIVERY_NOTES } from "./delivery-notes";

export const DEMO_REVENUE_BY_MONTH: RevenueByPeriod[] = [
  { period: "2026-01", revenue_before_tax: 95000, revenue_total: 113050, invoice_count: 2 },
  { period: "2026-02", revenue_before_tax: 175000, revenue_total: 208250, invoice_count: 3 },
  { period: "2026-03", revenue_before_tax: 150000, revenue_total: 178500, invoice_count: 2 },
];

export const DEMO_REVENUE_BY_CLIENT: RevenueByClient[] = [
  { client_id: "demo-client-001", client_name: "SARL Numidia Bâtiment", revenue_before_tax: 150000, revenue_total: 178500, invoice_count: 1 },
  { client_id: "demo-client-002", client_name: "EURL Sahara Négoce", revenue_before_tax: 63000, revenue_total: 74970, invoice_count: 1 },
  { client_id: "demo-client-003", client_name: "SPA Atlas Industrie", revenue_before_tax: 32000, revenue_total: 38080, invoice_count: 1 },
  { client_id: "demo-client-004", client_name: "Méditerranée Services", revenue_before_tax: 25000, revenue_total: 29750, invoice_count: 1 },
];

export const DEMO_PRODUCT_SALES: ProductSales[] = [
  { product_id: "demo-product-001", product_name: "Forfait création de site web", quantity_sold: 1, revenue_before_tax: 150000, revenue_total: 178500 },
  { product_id: "demo-product-002", product_name: "Création de logo", quantity_sold: 1, revenue_before_tax: 35000, revenue_total: 41650 },
  { product_id: "demo-product-003", product_name: "Chaise de bureau ergonomique", quantity_sold: 1, revenue_before_tax: 28000, revenue_total: 33320 },
  { product_id: "demo-product-004", product_name: "Conseil à l'heure", quantity_sold: 4, revenue_before_tax: 32000, revenue_total: 38080 },
  { product_id: "demo-product-007", product_name: "Maintenance mensuelle", quantity_sold: 1, revenue_before_tax: 25000, revenue_total: 29750 },
];

export const DEMO_OUTSTANDING_PAYMENTS: OutstandingPayment[] = [
  {
    invoice_id: "demo-invoice-002",
    invoice_number: "FAC-2026-002",
    client_name: "EURL Sahara Négoce",
    issue_date: "2026-03-05",
    due_date: "2026-04-05",
    total: 74970,
    days_overdue: 0,
  },
];

/**
 * Derived from DEMO_EXPENSES rather than written out, so the demo breakdown can
 * never disagree with the demo expense list a prospect is looking at.
 */
export const DEMO_EXPENSES_BY_CATEGORY: ExpensesByCategoryReport = (() => {
  const buckets = new Map<string, { category_id: string | null; category_name: string | null; total_amount: number; expense_count: number }>();
  let total = 0;
  for (const expense of DEMO_EXPENSES) {
    const key = expense.category?.id ?? "";
    const bucket = buckets.get(key) ?? {
      category_id: expense.category?.id ?? null,
      category_name: expense.category?.name ?? null,
      total_amount: 0,
      expense_count: 0,
    };
    bucket.total_amount += expense.amount;
    bucket.expense_count += 1;
    total += expense.amount;
    buckets.set(key, bucket);
  }
  const categories = Array.from(buckets.values())
    .sort((a, b) => b.total_amount - a.total_amount)
    .map((b) => ({ ...b, share: total > 0 ? (b.total_amount / total) * 100 : 0 }));
  return { total, categories };
})();

/** Same source, grouped by month: the expenses report tab was empty in demo. */
export const DEMO_EXPENSES_BY_MONTH: ExpenseReportEntry[] = (() => {
  const months = new Map<string, ExpenseReportEntry>();
  for (const expense of DEMO_EXPENSES) {
    const period = expense.date.slice(0, 7);
    const entry = months.get(period) ?? { period, total_amount: 0, expense_count: 0 };
    entry.total_amount += expense.amount;
    entry.expense_count += 1;
    months.set(period, entry);
  }
  return Array.from(months.values()).sort((a, b) => a.period.localeCompare(b.period));
})();

/**
 * Steering figures, derived from the demo quotes and invoices for the same
 * reason as the expense breakdown: a prospect must never see a summary that
 * disagrees with the lists it summarises.
 */
export const DEMO_PIPELINE: PipelineReport = (() => {
  const bucket = <T extends { status: string; total: number }>(
    rows: T[],
    statuses: readonly string[]
  ) =>
    statuses.map((status) => {
      const matching = rows.filter((r) => r.status === status);
      return {
        status,
        count: matching.length,
        total: matching.reduce((s, r) => s + r.total, 0),
      };
    });

  const awaitingInvoice = DEMO_QUOTES.filter((q) => q.status === "ACCEPTED").map((q) => ({
    id: q.id,
    number: q.quote_number,
    client: q.client?.name ?? "",
    date: q.issue_date,
    amount: q.total,
  }));

  const awaitingPayment = DEMO_INVOICES.filter((i) => i.status === "ISSUED").map((i) => {
    const paid = i.payments?.reduce((s, p) => s + p.amount, 0) ?? 0;
    return {
      id: i.id,
      number: i.invoice_number,
      client: i.client?.name ?? "",
      date: i.issue_date,
      due_date: i.due_date,
      amount: i.total,
      paid,
      remaining: Math.max(0, i.total - paid),
      // Fixed rather than computed from today's date: the demo must read the
      // same way in six months.
      overdue: false,
    };
  });

  return {
    quotes: bucket(DEMO_QUOTES, ["DRAFT", "SENT", "ACCEPTED", "EXPIRED"]),
    invoices: bucket(DEMO_INVOICES, ["DRAFT", "ISSUED", "PAID"]),
    delivery_notes: bucket(
      DEMO_DELIVERY_NOTES.map((n) => ({ status: n.status, total: 0 })),
      ["DRAFT", "DELIVERED", "CANCELLED"]
    ),
    in_progress: {
      awaiting_invoice: awaitingInvoice,
      awaiting_invoice_total: awaitingInvoice.reduce((s, r) => s + r.amount, 0),
      awaiting_payment: awaitingPayment,
      awaiting_payment_total: awaitingPayment.reduce((s, r) => s + r.remaining, 0),
      overdue_count: 0,
      overdue_total: 0,
    },
  };
})();
