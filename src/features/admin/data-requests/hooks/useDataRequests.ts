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
