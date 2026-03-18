import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminTenantsApi } from "@/lib/admin-api";

interface TenantsFilters {
  status?: string;
  search?: string;
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

export function useDeleteTenant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => adminTenantsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-tenants"] });
    },
  });
}
