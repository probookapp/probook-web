import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { adminTenantsApi } from "@/lib/admin-api";
import { LIST_PAGE_SIZE } from "@/lib/pagination";

interface TenantsFilters {
  status?: string;
  search?: string;
}

/**
 * Cursor-paginated tenants list for the admin tenants page. Status and search
 * are forwarded to the route's existing server-side filters.
 */
export function useAdminTenantsInfinite(filters?: TenantsFilters) {
  return useInfiniteQuery({
    // Shares the ["admin-tenants"] prefix so existing invalidations refresh it too.
    queryKey: ["admin-tenants", "infinite", filters ?? {}],
    queryFn: ({ pageParam }) =>
      adminTenantsApi.getPage({
        limit: LIST_PAGE_SIZE,
        cursor: pageParam ?? undefined,
        status: filters?.status,
        search: filters?.search,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
    // Keep the previous list on screen while a new filter/search loads.
    placeholderData: keepPreviousData,
  });
}

export function useAdminTenants(filters?: TenantsFilters) {
  return useQuery({
    queryKey: ["admin-tenants", filters],
    queryFn: async () => {
      const tenants = await adminTenantsApi.getAll();
      if (!filters) return tenants;
      return (tenants as Record<string, unknown>[]).filter((t) => {
        if (filters.status && t.status !== filters.status) return false;
        if (filters.search) {
          const search = filters.search.toLowerCase();
          const name = String(t.name || "").toLowerCase();
          const slug = String(t.slug || "").toLowerCase();
          if (!name.includes(search) && !slug.includes(search)) return false;
        }
        return true;
      });
    },
  });
}

export function useAdminTenant(id: string) {
  return useQuery({
    queryKey: ["admin-tenants", id],
    queryFn: () => adminTenantsApi.getById(id),
    enabled: !!id,
  });
}

export function useSuspendTenant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => adminTenantsApi.suspend(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-tenants"] });
    },
  });
}

export function useActivateTenant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => adminTenantsApi.activate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-tenants"] });
    },
  });
}

export function useGrantTrial() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, days }: { id: string; days: number }) =>
      adminTenantsApi.grantTrial(id, days),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-tenants"] });
    },
  });
}

export function useDeleteTenant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => adminTenantsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-tenants"] });
    },
  });
}

export function useUpdateTenant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Record<string, unknown>) => adminTenantsApi.update(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-tenants"] });
    },
  });
}

export function useImpersonateTenant() {
  return useMutation({
    mutationFn: (id: string) => adminTenantsApi.impersonate(id),
  });
}
