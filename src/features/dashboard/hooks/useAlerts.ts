import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { alertsApi } from "@/lib/api";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { DEMO_ALERTS_SUMMARY } from "@/lib/demo-data";

export function useAlertsSummary() {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["alerts-summary", { demo: isDemoMode }],
    queryFn: isDemoMode ? () => DEMO_ALERTS_SUMMARY : alertsApi.getSummary,
    refetchInterval: isDemoMode ? false : 60000,
    staleTime: isDemoMode ? Infinity : undefined,
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
