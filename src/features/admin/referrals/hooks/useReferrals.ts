import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminReferralsApi } from "@/lib/admin-api";

export function useAdminReferrals() {
  return useQuery({
    queryKey: ["admin-referrals"],
    queryFn: adminReferralsApi.getAll,
  });
}

export function useToggleReferralCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      adminReferralsApi.toggle(id, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-referrals"] });
    },
  });
}

export function useCreateReferralCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { tenant_id: string; code?: string }) =>
      adminReferralsApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-referrals"] });
    },
  });
}
