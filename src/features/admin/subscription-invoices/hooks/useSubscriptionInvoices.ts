import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { adminSubscriptionInvoicesApi } from "@/lib/admin-api";
import { LIST_PAGE_SIZE } from "@/lib/pagination";

export function useAdminSubscriptionInvoices(filters?: { status?: string }) {
  return useQuery({
    queryKey: ["admin-subscription-invoices", filters],
    queryFn: () => adminSubscriptionInvoicesApi.getAll(filters),
  });
}

/**
 * Cursor-paginated subscription invoices for the admin list page. `status` is
 * forwarded to the route's existing server-side filter.
 */
export function useAdminSubscriptionInvoicesInfinite(filters?: { status?: string }) {
  return useInfiniteQuery({
    // Shares the ["admin-subscription-invoices"] prefix so existing invalidations refresh it too.
    queryKey: ["admin-subscription-invoices", "infinite", filters ?? {}],
    queryFn: ({ pageParam }) =>
      adminSubscriptionInvoicesApi.getPage({
        limit: LIST_PAGE_SIZE,
        cursor: pageParam ?? undefined,
        status: filters?.status,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
    // Keep the previous list on screen while a new status filter loads.
    placeholderData: keepPreviousData,
  });
}

export function useMarkInvoicePaid() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payment_method }: { id: string; payment_method: string }) =>
      adminSubscriptionInvoicesApi.markPaid(id, { payment_method }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-subscription-invoices"] });
    },
  });
}

export function useCreateSubscriptionInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Record<string, unknown>) => adminSubscriptionInvoicesApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-subscription-invoices"] });
    },
  });
}

export function useUpdateSubscriptionInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Record<string, unknown> }) =>
      adminSubscriptionInvoicesApi.update(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-subscription-invoices"] });
    },
  });
}
