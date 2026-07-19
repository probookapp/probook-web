import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { adminUsersApi } from "@/lib/admin-api";
import { LIST_PAGE_SIZE } from "@/lib/pagination";

export function useAdminUsers() {
  return useQuery({
    queryKey: ["admin-users"],
    queryFn: adminUsersApi.getAll,
  });
}

/**
 * Cursor-paginated users list for the admin users page. The search term is
 * forwarded to the route's existing server-side `search` filter.
 */
export function useAdminUsersInfinite(search?: string) {
  return useInfiniteQuery({
    // Shares the ["admin-users"] prefix so existing invalidations refresh it too.
    queryKey: ["admin-users", "infinite", { search: search || "" }],
    queryFn: ({ pageParam }) =>
      adminUsersApi.getPage({
        limit: LIST_PAGE_SIZE,
        cursor: pageParam ?? undefined,
        search: search || undefined,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
    // Keep the previous list on screen while a new search loads.
    placeholderData: keepPreviousData,
  });
}

export function useDisableUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => adminUsersApi.disable(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });
}

export function useResetUserPassword() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Record<string, unknown> }) =>
      adminUsersApi.resetPassword(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });
}
