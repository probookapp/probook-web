import { useQuery } from "@tanstack/react-query";
import { reportApi } from "@/lib/api";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import {
  DEMO_REVENUE_BY_MONTH,
  DEMO_REVENUE_BY_CLIENT,
  DEMO_PRODUCT_SALES,
  DEMO_OUTSTANDING_PAYMENTS,
} from "@/lib/demo-data";

export function useRevenueByMonth(startDate?: string, endDate?: string) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["reports", "revenue-by-month", startDate, endDate, { demo: isDemoMode }],
    queryFn: isDemoMode ? () => DEMO_REVENUE_BY_MONTH : () => reportApi.getRevenueByMonth(startDate, endDate),
    staleTime: isDemoMode ? Infinity : undefined,
  });
}

export function useRevenueByClient(startDate?: string, endDate?: string) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["reports", "revenue-by-client", startDate, endDate, { demo: isDemoMode }],
    queryFn: isDemoMode ? () => DEMO_REVENUE_BY_CLIENT : () => reportApi.getRevenueByClient(startDate, endDate),
    staleTime: isDemoMode ? Infinity : undefined,
  });
}

export function useProductSales(startDate?: string, endDate?: string) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["reports", "product-sales", startDate, endDate, { demo: isDemoMode }],
    queryFn: isDemoMode ? () => DEMO_PRODUCT_SALES : () => reportApi.getProductSales(startDate, endDate),
    staleTime: isDemoMode ? Infinity : undefined,
  });
}

export function useOutstandingPayments() {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["reports", "outstanding-payments", { demo: isDemoMode }],
    queryFn: isDemoMode ? () => DEMO_OUTSTANDING_PAYMENTS : () => reportApi.getOutstandingPayments(),
    staleTime: isDemoMode ? Infinity : undefined,
  });
}

export function useQuoteConversionStats(startDate?: string, endDate?: string) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["reports", "quote-conversion", startDate, endDate, { demo: isDemoMode }],
    queryFn: isDemoMode
      ? () => ({ total_quotes: 3, converted_quotes: 1, conversion_rate: 33.3, total_quoted_amount: 346885, converted_amount: 59500 })
      : () => reportApi.getQuoteConversionStats(startDate, endDate),
    staleTime: isDemoMode ? Infinity : undefined,
  });
}
