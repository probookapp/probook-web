import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { productApi, reportApi } from "@/lib/api";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import type { AdjustStockInput } from "@/types";

export function useProductMovements(productId: string, enabled = true) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["product-movements", productId],
    queryFn: () => productApi.getMovements(productId),
    enabled: !!productId && enabled && !isDemoMode,
  });
}

export function useProductStockLevels(productId: string, enabled = true) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["product-stock-levels", productId],
    queryFn: () => productApi.getStockLevels(productId),
    enabled: !!productId && enabled && !isDemoMode,
  });
}

export function useAdjustStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AdjustStockInput }) =>
      productApi.adjustStock(id, input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["pos-products"] });
      queryClient.invalidateQueries({ queryKey: ["product-movements", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["low-stock"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useLowStock(threshold?: number, locationId?: string) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["low-stock", { threshold: threshold ?? null, locationId: locationId ?? null }],
    queryFn: isDemoMode ? () => [] : () => reportApi.getLowStock(threshold, locationId),
    staleTime: isDemoMode ? Infinity : undefined,
  });
}
