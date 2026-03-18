import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminPlatformAdminsApi } from "@/lib/admin-api";

export function usePlatformAdmins() {
  return useQuery({
    queryKey: ["platform-admins"],
    queryFn: adminPlatformAdminsApi.getAll,
  });
}

export function useCreatePlatformAdmin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      adminPlatformAdminsApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-admins"] });
    },
  });
}

export function useUpdatePlatformAdmin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      adminPlatformAdminsApi.update(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-admins"] });
    },
  });
}

export function useDeletePlatformAdmin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => adminPlatformAdminsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-admins"] });
    },
  });
}
