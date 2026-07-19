import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { adminSubscriptionsApi, adminSubscriptionRequestsApi } from "@/lib/admin-api";
import { LIST_PAGE_SIZE } from "@/lib/pagination";

interface SubscriptionsFilters {
  status?: string;
  search?: string;
}

/**
 * Cursor-paginated subscriptions list for the admin subscriptions page.
 * `status` is forwarded to the route's existing server-side filter; the route
 * has no search filter, so text search stays client-side over loaded pages.
 */
export function useAdminSubscriptionsInfinite(status?: string) {
  return useInfiniteQuery({
    // Shares the ["admin-subscriptions"] prefix so existing invalidations refresh it too.
    queryKey: ["admin-subscriptions", "infinite", { status: status || "" }],
    queryFn: ({ pageParam }) =>
      adminSubscriptionsApi.getPage({
        limit: LIST_PAGE_SIZE,
        cursor: pageParam ?? undefined,
        status: status || undefined,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
    // Keep the previous list on screen while a new status filter loads.
    placeholderData: keepPreviousData,
  });
}

interface RequestsFilters {
  status?: string;
}

export function useAdminSubscriptions(filters?: SubscriptionsFilters) {
  return useQuery({
    queryKey: ["admin-subscriptions", filters],
    queryFn: async () => {
      const subscriptions = await adminSubscriptionsApi.getAll();
      if (!filters) return subscriptions;
      return (subscriptions as Record<string, unknown>[]).filter((s) => {
        if (filters.status && s.status !== filters.status) return false;
        if (filters.search) {
          const search = filters.search.toLowerCase();
          const tenantName = String((s.tenant as Record<string, unknown>)?.name || s.tenant_name || "").toLowerCase();
          if (!tenantName.includes(search)) return false;
        }
        return true;
      });
    },
  });
}

export function useAdminSubscription(id: string) {
  return useQuery({
    queryKey: ["admin-subscriptions", id],
    queryFn: () => adminSubscriptionsApi.getById(id),
    enabled: !!id,
  });
}

export function useRenewSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Record<string, unknown> }) =>
      adminSubscriptionsApi.renew(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-subscriptions"] });
    },
  });
}

export function useCancelSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => adminSubscriptionsApi.cancel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-subscriptions"] });
    },
  });
}

export function useUpdateSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Record<string, unknown> }) =>
      adminSubscriptionsApi.update(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-subscriptions"] });
    },
  });
}

export function useAdminSubscriptionRequests(filters?: RequestsFilters) {
  return useQuery({
    queryKey: ["admin-subscription-requests", filters],
    queryFn: async () => {
      const requests = await adminSubscriptionRequestsApi.getAll();
      if (!filters) return requests;
      return (requests as Record<string, unknown>[]).filter((r) => {
        if (filters.status && r.status !== filters.status) return false;
        return true;
      });
    },
  });
}

export function useApproveSubscriptionRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => adminSubscriptionRequestsApi.approve(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-subscription-requests"] });
      queryClient.invalidateQueries({ queryKey: ["admin-subscriptions"] });
    },
  });
}

export function useRejectSubscriptionRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Record<string, unknown> }) =>
      adminSubscriptionRequestsApi.reject(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-subscription-requests"] });
    },
  });
}
