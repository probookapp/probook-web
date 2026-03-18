import { useQuery } from "@tanstack/react-query";
import { adminSystemApi } from "@/lib/admin-api";

export function useSystemHealth() {
  return useQuery({
    queryKey: ["admin-system-health"],
    queryFn: adminSystemApi.getHealth,
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}
