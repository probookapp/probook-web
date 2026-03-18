import { useQuery } from "@tanstack/react-query";
import { reportApi } from "@/lib/api";

export function useRevenueByMonth(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ["reports", "revenue-by-month", startDate, endDate],
    queryFn: () => reportApi.getRevenueByMonth(startDate, endDate),
  });
}

export function useRevenueByClient(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ["reports", "revenue-by-client", startDate, endDate],
    queryFn: () => reportApi.getRevenueByClient(startDate, endDate),
  });
}

export function useProductSales(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ["reports", "product-sales", startDate, endDate],
    queryFn: () => reportApi.getProductSales(startDate, endDate),
  });
}

export function useOutstandingPayments() {
  return useQuery({
    queryKey: ["reports", "outstanding-payments"],
    queryFn: () => reportApi.getOutstandingPayments(),
  });
}

export function useQuoteConversionStats(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ["reports", "quote-conversion", startDate, endDate],
    queryFn: () => reportApi.getQuoteConversionStats(startDate, endDate),
  });
}
