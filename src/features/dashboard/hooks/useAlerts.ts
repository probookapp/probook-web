import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { alertsApi } from "@/lib/api";

export function useAlertsSummary() {
  return useQuery({
    queryKey: ["alerts-summary"],
    queryFn: alertsApi.getSummary,
    refetchInterval: 60000, // Refresh every minute
  });
}

export function useMarkQuoteExpired() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (quoteId: string) => alertsApi.markQuoteExpired(quoteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts-summary"] });
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
    },
  });
}
