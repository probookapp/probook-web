import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminFeaturesApi } from "@/lib/admin-api";

export function useAdminFeatures() {
  return useQuery({
    queryKey: ["admin-features"],
    queryFn: adminFeaturesApi.getAll,
  });
}

export function useCreateFeature() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Record<string, unknown>) => adminFeaturesApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-features"] });
    },
  });
}

export function useUpdateFeature() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Record<string, unknown>) => adminFeaturesApi.update(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-features"] });
    },
  });
}

export function useTenantFeatures(tenantId: string) {
  return useQuery({
    queryKey: ["admin-tenant-features", tenantId],
    queryFn: () => adminFeaturesApi.getTenantFeatures(tenantId),
    enabled: !!tenantId,
  });
}

export function useUpdateTenantFeatures() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      tenantId,
      input,
    }: {
      tenantId: string;
      input: Record<string, unknown>;
    }) => adminFeaturesApi.updateTenantFeatures(tenantId, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["admin-tenant-features", variables.tenantId],
      });
    },
  });
}
