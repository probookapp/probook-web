import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminDataRequestsApi } from "@/lib/admin-api";

export function useAdminDataRequests() {
  return useQuery({
    queryKey: ["admin-data-requests"],
    queryFn: adminDataRequestsApi.getAll,
  });
}

export function useCreateDataRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Record<string, unknown>) => adminDataRequestsApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-data-requests"] });
    },
  });
}

export function useUpdateDataRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Record<string, unknown> }) =>
      adminDataRequestsApi.update(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-data-requests"] });
    },
  });
}

export function useExecuteDataRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, confirmTenantName }: { id: string; confirmTenantName: string }) =>
      adminDataRequestsApi.execute(id, { confirm_tenant_name: confirmTenantName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-data-requests"] });
      queryClient.invalidateQueries({ queryKey: ["admin-tenants"] });
    },
  });
}
