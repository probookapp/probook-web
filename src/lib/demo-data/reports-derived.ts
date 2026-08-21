import type {
  AccountingExport,
  DailyPosReport,
  InventoryValuationRow,
  ProfitMarginRow,
  QuoteConversionStats,
  SupplierSpendRow,
  TaxSummary,
} from "@/types";
import { DEMO_PRODUCTS } from "./products";
import { DEMO_INVOICES } from "./invoices";
import { DEMO_QUOTES } from "./quotes";
import { DEMO_EXPENSES } from "./expenses";
import { DEMO_PURCHASES } from "./purchases";
import { DEMO_SUPPLIERS } from "./suppliers";

/**
 * The report tabs that used to come back empty in demo mode.
 *
 * Six of them returned `[]` or `null`, so a prospect clicking through the
 * reports found blank pages and reasonably concluded the feature did not exist.
 * Everything here is derived from the demo lists rather than written out, so a
 * summary can never contradict the documents it summarises.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Non-draft invoices are the ones that count as sales, as on the server. */
const billedInvoices = DEMO_INVOICES.filter((i) => i.status !== "DRAFT");

export const DEMO_PROFIT_MARGIN: ProfitMarginRow[] = (() => {
  const byProduct = new Map<string, ProfitMarginRow>();

  for (const invoice of billedInvoices) {
    for (const line of invoice.lines ?? []) {
      const product = DEMO_PRODUCTS.find((p) => p.id === line.product_id);
      if (!product) continue;
      const row = byProduct.get(product.id) ?? {
        product_id: product.id,
        product_name: product.designation,
        quantity_sold: 0,
        revenue: 0,
        cost: 0,
        margin: 0,
        margin_percent: 0,
      };
      row.quantity_sold += line.quantity;
      row.revenue += line.subtotal;
      row.cost += (product.purchase_price ?? 0) * line.quantity;
      byProduct.set(product.id, row);
    }
  }

  return Array.from(byProduct.values())
    .map((row) => ({
      ...row,
      revenue: round2(row.revenue),
      cost: round2(row.cost),
      margin: round2(row.revenue - row.cost),
      margin_percent: row.revenue > 0 ? round2(((row.revenue - row.cost) / row.revenue) * 100) : 0,
    }))
    .sort((a, b) => b.margin - a.margin);
})();

export const DEMO_SUPPLIER_SPEND: SupplierSpendRow[] = (() => {
  const bySupplier = new Map<string, SupplierSpendRow>();
  for (const order of DEMO_PURCHASES) {
    const supplier = DEMO_SUPPLIERS.find((s) => s.id === order.supplier_id);
    if (!supplier) continue;
    const row = bySupplier.get(supplier.id) ?? {
      supplier_id: supplier.id,
      supplier_name: supplier.name,
      order_count: 0,
      total_spend: 0,
    };
    row.order_count += 1;
    row.total_spend += order.total;
    bySupplier.set(supplier.id, row);
  }
  return Array.from(bySupplier.values())
    .map((r) => ({ ...r, total_spend: round2(r.total_spend) }))
    .sort((a, b) => b.total_spend - a.total_spend);
})();

export const DEMO_INVENTORY_VALUATION: InventoryValuationRow[] = DEMO_PRODUCTS
  // Services hold no stock, so they carry no stock value.
  .filter((p) => !p.is_service && (p.quantity ?? 0) > 0)
  .map((p) => ({
    product_id: p.id,
    designation: p.designation,
    reference: p.reference,
    quantity: p.quantity ?? 0,
    purchase_price: p.purchase_price ?? 0,
    stock_value: round2((p.quantity ?? 0) * (p.purchase_price ?? 0)),
  }))
  .sort((a, b) => b.stock_value - a.stock_value);

export const DEMO_QUOTE_CONVERSION: QuoteConversionStats = (() => {
  const converted = DEMO_QUOTES.filter((q) => q.status === "ACCEPTED");
  const total = DEMO_QUOTES.length;
  return {
    total_quotes: total,
    converted_quotes: converted.length,
    conversion_rate: total > 0 ? round2((converted.length / total) * 100) : 0,
    total_quoted_amount: round2(DEMO_QUOTES.reduce((s, q) => s + q.total, 0)),
    converted_amount: round2(converted.reduce((s, q) => s + q.total, 0)),
  };
})();

export const DEMO_TAX_SUMMARY: TaxSummary = (() => {
  const byRate = new Map<number, { tax_rate: number; total_ht: number; total_vat: number; total_ttc: number }>();
  let salesHt = 0;
  let salesVat = 0;
  let salesTtc = 0;

  for (const invoice of billedInvoices) {
    salesHt += invoice.subtotal;
    salesVat += invoice.tax_amount;
    salesTtc += invoice.total;
    for (const line of invoice.lines ?? []) {
      const bucket = byRate.get(line.tax_rate) ?? {
        tax_rate: line.tax_rate,
        total_ht: 0,
        total_vat: 0,
        total_ttc: 0,
      };
      bucket.total_ht += line.subtotal;
      bucket.total_vat += line.tax_amount;
      bucket.total_ttc += line.total;
      byRate.set(line.tax_rate, bucket);
    }
  }

  const purchasesHt = DEMO_PURCHASES.reduce((s, o) => s + o.subtotal, 0);
  const purchasesVat = DEMO_PURCHASES.reduce((s, o) => s + o.tax_amount, 0);
  const purchasesTtc = DEMO_PURCHASES.reduce((s, o) => s + o.total, 0);

  return {
    sales: {
      total_ht: round2(salesHt),
      total_vat: round2(salesVat),
      total_ttc: round2(salesTtc),
      // No commercial discount in the demo invoices, so gross equals the base.
      gross_ht: round2(salesHt),
      discount_ht: 0,
      invoice_count: billedInvoices.length,
      pos_transaction_count: 0,
      credit_note_count: 0,
      by_rate: Array.from(byRate.values())
        .map((b) => ({
          tax_rate: b.tax_rate,
          total_ht: round2(b.total_ht),
          total_vat: round2(b.total_vat),
          total_ttc: round2(b.total_ttc),
        }))
        .sort((a, b) => a.tax_rate - b.tax_rate),
    },
    purchases: {
      total_ht: round2(purchasesHt),
      total_vat: round2(purchasesVat),
      total_ttc: round2(purchasesTtc),
      order_count: DEMO_PURCHASES.length,
      by_rate: [{ tax_rate: 19, total_ht: round2(purchasesHt), total_vat: round2(purchasesVat), total_ttc: round2(purchasesTtc) }],
    },
    net_vat: round2(salesVat - purchasesVat),
    stamp_duty: {
      enabled: true,
      rate: 1,
      amount_due: 0,
    },
  };
})();

export const DEMO_ACCOUNTING_EXPORT: AccountingExport = (() => {
  const sales = billedInvoices.map((invoice) => ({
    date: invoice.issue_date,
    number: invoice.invoice_number,
    party: invoice.client?.name ?? "",
    gross_ht: round2(invoice.subtotal),
    discount: 0,
    ht: round2(invoice.subtotal),
    vat: round2(invoice.tax_amount),
    ttc: round2(invoice.total),
  }));

  const purchases = DEMO_PURCHASES.map((order) => ({
    date: order.order_date,
    number: order.order_number,
    party: DEMO_SUPPLIERS.find((s) => s.id === order.supplier_id)?.name ?? "",
    gross_ht: round2(order.subtotal),
    discount: 0,
    ht: round2(order.subtotal),
    vat: round2(order.tax_amount),
    ttc: round2(order.total),
  }));

  const payments = billedInvoices.flatMap((invoice) =>
    (invoice.payments ?? []).map((p) => ({
      date: p.payment_date,
      number: invoice.invoice_number,
      amount: p.amount,
      method: p.payment_method,
    }))
  );

  const expenses = DEMO_EXPENSES.map((e) => ({
    date: e.date,
    name: e.name,
    amount: e.amount,
  }));

  const journal = [
    ...sales.map((s) => ({ ...s, type: "sale", document: s.number })),
    ...purchases.map((p) => ({ ...p, type: "purchase", document: p.number })),
    ...payments.map((p) => ({
      date: p.date,
      type: "payment",
      document: p.number,
      party: p.method,
      gross_ht: 0,
      discount: 0,
      ht: 0,
      vat: 0,
      ttc: p.amount,
    })),
    ...expenses.map((e) => ({
      date: e.date,
      type: "expense",
      document: "",
      party: e.name,
      gross_ht: e.amount,
      discount: 0,
      ht: e.amount,
      vat: 0,
      ttc: e.amount,
    })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return { sales, refunds: [], purchases, payments, expenses, journal };
})();

/**
 * A plausible counter day. Not derived from anything — the demo has no POS
 * transactions — but stated once here so the daily report is not a blank page.
 */
export const DEMO_POS_DAILY: DailyPosReport = {
  date: "2026-03-20",
  register_id: null,
  register_name: "Caisse principale",
  session_count: 1,
  transaction_count: 14,
  total_sales: 86400,
  subtotal: 72605,
  tax_amount: 13795,
  cash_sales: 51400,
  card_sales: 22000,
  sales_by_method: [
    { method: "CASH", amount: 51400 },
    { method: "CARD", amount: 22000 },
    { method: "CHEQUE", amount: 8000 },
    { method: "TRANSFER", amount: 5000 },
  ],
  cancelled_count: 1,
  cancelled_total: 3200,
};
