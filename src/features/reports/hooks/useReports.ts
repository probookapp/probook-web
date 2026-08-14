import { useQuery } from "@tanstack/react-query";
import { reportApi, posApi } from "@/lib/api";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import {
  DEMO_REVENUE_BY_MONTH,
  DEMO_REVENUE_BY_CLIENT,
  DEMO_PRODUCT_SALES,
  DEMO_OUTSTANDING_PAYMENTS,
  DEMO_EXPENSES_BY_CATEGORY,
  DEMO_EXPENSES_BY_MONTH,
  DEMO_PIPELINE,
  DEMO_PROFIT_MARGIN,
  DEMO_SUPPLIER_SPEND,
  DEMO_INVENTORY_VALUATION,
  DEMO_QUOTE_CONVERSION,
  DEMO_TAX_SUMMARY,
  DEMO_ACCOUNTING_EXPORT,
  DEMO_POS_DAILY,
} from "@/lib/demo-data";

// Each hook accepts an optional `enabled` flag (default true) so ReportsPage
// can fetch only the visible report tab instead of firing all queries eagerly.

export function useRevenueByMonth(startDate?: string, endDate?: string, enabled = true) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["reports", "revenue-by-month", startDate, endDate, { demo: isDemoMode }],
    queryFn: isDemoMode ? () => DEMO_REVENUE_BY_MONTH : () => reportApi.getRevenueByMonth(startDate, endDate),
    staleTime: isDemoMode ? Infinity : undefined,
    enabled,
  });
}

export function useRevenueByClient(startDate?: string, endDate?: string, enabled = true) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["reports", "revenue-by-client", startDate, endDate, { demo: isDemoMode }],
    queryFn: isDemoMode ? () => DEMO_REVENUE_BY_CLIENT : () => reportApi.getRevenueByClient(startDate, endDate),
    staleTime: isDemoMode ? Infinity : undefined,
    enabled,
  });
}

export function useProductSales(startDate?: string, endDate?: string, enabled = true) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["reports", "product-sales", startDate, endDate, { demo: isDemoMode }],
    queryFn: isDemoMode ? () => DEMO_PRODUCT_SALES : () => reportApi.getProductSales(startDate, endDate),
    staleTime: isDemoMode ? Infinity : undefined,
    enabled,
  });
}

export function useOutstandingPayments(enabled = true) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["reports", "outstanding-payments", { demo: isDemoMode }],
    queryFn: isDemoMode ? () => DEMO_OUTSTANDING_PAYMENTS : () => reportApi.getOutstandingPayments(),
    staleTime: isDemoMode ? Infinity : undefined,
    enabled,
  });
}

export function useQuoteConversionStats(startDate?: string, endDate?: string, enabled = true) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["reports", "quote-conversion", startDate, endDate, { demo: isDemoMode }],
    queryFn: isDemoMode
      ? () => DEMO_QUOTE_CONVERSION
      : () => reportApi.getQuoteConversionStats(startDate, endDate),
    staleTime: isDemoMode ? Infinity : undefined,
    enabled,
  });
}

export function useExpensesReport(startDate?: string, endDate?: string, enabled = true) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["reports", "expenses", startDate, endDate, { demo: isDemoMode }],
    queryFn: isDemoMode
      ? () => DEMO_EXPENSES_BY_MONTH
      : () => reportApi.getExpensesReport(startDate, endDate),
    staleTime: isDemoMode ? Infinity : undefined,
    enabled,
  });
}

export function useExpensesByCategory(startDate?: string, endDate?: string, enabled = true) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["reports", "expenses-by-category", startDate, endDate, { demo: isDemoMode }],
    queryFn: isDemoMode
      ? () => DEMO_EXPENSES_BY_CATEGORY
      : () => reportApi.getExpensesByCategory(startDate, endDate),
    staleTime: isDemoMode ? Infinity : undefined,
    enabled,
  });
}

export function usePipelineReport(startDate?: string, endDate?: string, enabled = true) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["reports", "pipeline", startDate, endDate, { demo: isDemoMode }],
    queryFn: isDemoMode
      ? () => DEMO_PIPELINE
      : () => reportApi.getPipeline(startDate, endDate),
    staleTime: isDemoMode ? Infinity : undefined,
    enabled,
  });
}

export function useProfitMargin(startDate?: string, endDate?: string, enabled = true) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["reports", "profit-margin", startDate, endDate, { demo: isDemoMode }],
    queryFn: isDemoMode
      ? () => DEMO_PROFIT_MARGIN
      : () => reportApi.getProfitMargin(startDate, endDate),
    staleTime: isDemoMode ? Infinity : undefined,
    enabled,
  });
}

export function useSupplierSpend(startDate?: string, endDate?: string, enabled = true) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["reports", "supplier-spend", startDate, endDate, { demo: isDemoMode }],
    queryFn: isDemoMode
      ? () => DEMO_SUPPLIER_SPEND
      : () => reportApi.getSupplierSpend(startDate, endDate),
    staleTime: isDemoMode ? Infinity : undefined,
    enabled,
  });
}

export function useInventoryValuation(locationId?: string, enabled = true) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["reports", "inventory-valuation", locationId ?? null, { demo: isDemoMode }],
    queryFn: isDemoMode
      ? () => DEMO_INVENTORY_VALUATION
      : () => reportApi.getInventoryValuation(locationId),
    staleTime: isDemoMode ? Infinity : undefined,
    enabled,
  });
}

export function useTaxSummary(startDate?: string, endDate?: string, enabled = true) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["reports", "tax-summary", startDate, endDate, { demo: isDemoMode }],
    queryFn: isDemoMode
      ? () => DEMO_TAX_SUMMARY
      : () => reportApi.getTaxSummary(startDate, endDate),
    staleTime: isDemoMode ? Infinity : undefined,
    enabled,
  });
}

export function useAccountingExport(startDate?: string, endDate?: string, enabled = true) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["reports", "accounting-export", startDate, endDate, { demo: isDemoMode }],
    queryFn: isDemoMode
      ? () => DEMO_ACCOUNTING_EXPORT
      : () => reportApi.getAccountingExport(startDate, endDate),
    staleTime: isDemoMode ? Infinity : undefined,
    enabled,
  });
}

export function usePosDailyReport(date: string, registerId?: string, enabled = true) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["reports", "pos-daily", date, registerId, { demo: isDemoMode }],
    // In demo mode the queryFn resolves immediately, so the query can stay
    // enabled — keeping it disabled would leave isPending true forever.
    queryFn: isDemoMode
      ? () => DEMO_POS_DAILY
      : () => posApi.getDailyReport(date, registerId),
    enabled: enabled && !!date,
  });
}
