import { useQuery } from "@tanstack/react-query";
import { adminAnalyticsApi } from "@/lib/admin-api";

export function useAdminOverview() {
  return useQuery({
    queryKey: ["admin-analytics-overview"],
    queryFn: adminAnalyticsApi.getOverview,
  });
}

export function useAdminSignups(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ["admin-analytics-signups", startDate, endDate],
    queryFn: () => adminAnalyticsApi.getSignups(startDate, endDate),
  });
}

export function useAdminRevenue(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ["admin-analytics-revenue", startDate, endDate],
    queryFn: () => adminAnalyticsApi.getRevenue(startDate, endDate),
  });
}

export function useAdminSubscriptionStats() {
  return useQuery({
    queryKey: ["admin-analytics-subscriptions"],
    queryFn: adminAnalyticsApi.getSubscriptions,
  });
}
