import { useQuery } from "@tanstack/react-query";
import { reportApi, posApi } from "@/lib/api";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import {
  DEMO_REVENUE_BY_MONTH,
  DEMO_REVENUE_BY_CLIENT,
  DEMO_PRODUCT_SALES,
  DEMO_OUTSTANDING_PAYMENTS,
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
      ? () => ({ total_quotes: 3, converted_quotes: 1, conversion_rate: 33.3, total_quoted_amount: 346885, converted_amount: 59500 })
      : () => reportApi.getQuoteConversionStats(startDate, endDate),
    staleTime: isDemoMode ? Infinity : undefined,
    enabled,
  });
}

export function useExpensesReport(startDate?: string, endDate?: string, enabled = true) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["reports", "expenses", startDate, endDate, { demo: isDemoMode }],
    queryFn: isDemoMode ? () => [] : () => reportApi.getExpensesReport(startDate, endDate),
    staleTime: isDemoMode ? Infinity : undefined,
    enabled,
  });
}

export function useProfitMargin(startDate?: string, endDate?: string, enabled = true) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["reports", "profit-margin", startDate, endDate, { demo: isDemoMode }],
    queryFn: isDemoMode ? () => [] : () => reportApi.getProfitMargin(startDate, endDate),
    staleTime: isDemoMode ? Infinity : undefined,
    enabled,
  });
}

export function useSupplierSpend(startDate?: string, endDate?: string, enabled = true) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["reports", "supplier-spend", startDate, endDate, { demo: isDemoMode }],
    queryFn: isDemoMode ? () => [] : () => reportApi.getSupplierSpend(startDate, endDate),
    staleTime: isDemoMode ? Infinity : undefined,
    enabled,
  });
}

export function useInventoryValuation(locationId?: string, enabled = true) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["reports", "inventory-valuation", locationId ?? null, { demo: isDemoMode }],
    queryFn: isDemoMode ? () => [] : () => reportApi.getInventoryValuation(locationId),
    staleTime: isDemoMode ? Infinity : undefined,
    enabled,
  });
}

export function useTaxSummary(startDate?: string, endDate?: string, enabled = true) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["reports", "tax-summary", startDate, endDate, { demo: isDemoMode }],
    queryFn: isDemoMode ? () => null : () => reportApi.getTaxSummary(startDate, endDate),
    staleTime: isDemoMode ? Infinity : undefined,
    enabled,
  });
}

export function useAccountingExport(startDate?: string, endDate?: string, enabled = true) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["reports", "accounting-export", startDate, endDate, { demo: isDemoMode }],
    queryFn: isDemoMode ? () => null : () => reportApi.getAccountingExport(startDate, endDate),
    staleTime: isDemoMode ? Infinity : undefined,
    enabled,
  });
}

export function usePosDailyReport(date: string, registerId?: string, enabled = true) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["reports", "pos-daily", date, registerId, { demo: isDemoMode }],
    // In demo mode the queryFn resolves to null immediately, so the query can
    // stay enabled — keeping it disabled would leave isPending true forever.
    queryFn: isDemoMode ? () => null : () => posApi.getDailyReport(date, registerId),
    enabled: enabled && !!date,
  });
}
