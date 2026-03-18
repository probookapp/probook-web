import { useQuery } from "@tanstack/react-query";
import { adminReferralsApi } from "@/lib/admin-api";

export function useAdminReferrals() {
  return useQuery({
    queryKey: ["admin-referrals"],
    queryFn: adminReferralsApi.getAll,
  });
}
