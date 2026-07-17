import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { posApi } from "@/lib/api";
import type { CreatePrinterConfigInput, UpdatePrinterConfigInput } from "@/types";

export function usePrinterConfigs() {
  return useQuery({
    queryKey: ["pos-printer-configs"],
    queryFn: posApi.getPrinterConfigs,
  });
}

export function usePosRegisters() {
  return useQuery({
    queryKey: ["pos-registers"],
    queryFn: posApi.getRegisters,
  });
}

export function useCreatePrinterConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePrinterConfigInput) => posApi.createPrinterConfig(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pos-printer-configs"] });
    },
  });
}

export function useUpdatePrinterConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdatePrinterConfigInput) => posApi.updatePrinterConfig(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pos-printer-configs"] });
    },
  });
}

export function useDeletePrinterConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => posApi.deletePrinterConfig(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pos-printer-configs"] });
    },
  });
}
