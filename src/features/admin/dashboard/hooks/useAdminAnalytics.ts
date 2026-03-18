import { useQuery } from "@tanstack/react-query";
import { adminAnalyticsApi } from "@/lib/admin-api";

export function useAdminOverview() {
  return useQuery({
    queryKey: ["admin-analytics-overview"],
    queryFn: adminAnalyticsApi.getOverview,
  });
}

export function useAdminSignups(months?: number) {
  return useQuery({
    queryKey: ["admin-analytics-signups", months],
    queryFn: () => adminAnalyticsApi.getSignups(),
  });
}

export function useAdminRevenue(months?: number) {
  return useQuery({
    queryKey: ["admin-analytics-revenue", months],
    queryFn: () => adminAnalyticsApi.getRevenue(),
  });
}

export function useAdminSubscriptionStats() {
  return useQuery({
    queryKey: ["admin-analytics-subscriptions"],
    queryFn: adminAnalyticsApi.getSubscriptions,
  });
}
