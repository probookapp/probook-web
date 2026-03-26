import type { RevenueByPeriod, RevenueByClient, ProductSales, OutstandingPayment } from "@/types";

export const DEMO_REVENUE_BY_MONTH: RevenueByPeriod[] = [
  { period: "2026-01", revenue_before_tax: 95000, revenue_total: 113050, invoice_count: 2 },
  { period: "2026-02", revenue_before_tax: 175000, revenue_total: 208250, invoice_count: 3 },
  { period: "2026-03", revenue_before_tax: 150000, revenue_total: 178500, invoice_count: 2 },
];

export const DEMO_REVENUE_BY_CLIENT: RevenueByClient[] = [
  { client_id: "demo-client-001", client_name: "Acme Corp", revenue_before_tax: 150000, revenue_total: 178500, invoice_count: 1 },
  { client_id: "demo-client-002", client_name: "Sahara Trading Co.", revenue_before_tax: 63000, revenue_total: 74970, invoice_count: 1 },
  { client_id: "demo-client-003", client_name: "Atlas Industries", revenue_before_tax: 32000, revenue_total: 38080, invoice_count: 1 },
  { client_id: "demo-client-004", client_name: "Méditerranée Services", revenue_before_tax: 25000, revenue_total: 29750, invoice_count: 1 },
];

export const DEMO_PRODUCT_SALES: ProductSales[] = [
  { product_id: "demo-product-001", product_name: "Web Development Package", quantity_sold: 1, revenue_before_tax: 150000, revenue_total: 178500 },
  { product_id: "demo-product-002", product_name: "Logo Design", quantity_sold: 1, revenue_before_tax: 35000, revenue_total: 41650 },
  { product_id: "demo-product-003", product_name: "Office Chair - Ergonomic", quantity_sold: 1, revenue_before_tax: 28000, revenue_total: 33320 },
  { product_id: "demo-product-004", product_name: "Consulting - Hourly", quantity_sold: 4, revenue_before_tax: 32000, revenue_total: 38080 },
  { product_id: "demo-product-007", product_name: "Monthly Maintenance", quantity_sold: 1, revenue_before_tax: 25000, revenue_total: 29750 },
];

export const DEMO_OUTSTANDING_PAYMENTS: OutstandingPayment[] = [
  {
    invoice_id: "demo-invoice-002",
    invoice_number: "FAC-2026-002",
    client_name: "Sahara Trading Co.",
    issue_date: "2026-03-05",
    due_date: "2026-04-05",
    total: 74970,
    days_overdue: 0,
  },
];
