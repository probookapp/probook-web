import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { posApi } from "@/lib/api";
import { posKeys } from "./usePosSession";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import type { CreatePosTransactionInput, CreateCashMovementInput } from "@/types";

// Product lookup by barcode
export function useLookupProductByBarcode() {
  return useMutation({
    mutationFn: (barcode: string) => posApi.lookupProductByBarcode(barcode),
  });
}

// Transactions
export function useCreateTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePosTransactionInput) =>
      posApi.createTransaction(input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: posKeys.sessionTransactions(variables.session_id),
      });
      // Invalidate products to reflect stock changes
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useSessionTransactions(sessionId: string | undefined) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: posKeys.sessionTransactions(sessionId ?? ""),
    queryFn: isDemoMode ? () => [] : () => posApi.getSessionTransactions(sessionId!),
    enabled: !!sessionId && !isDemoMode,
  });
}

export function useCancelTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      posApi.cancelTransaction(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: posKeys.transactions() });
      // Invalidate products to reflect stock restoration
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

// Cash movements
export function useCreateCashMovement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCashMovementInput) =>
      posApi.createCashMovement(input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: posKeys.cashMovements(variables.session_id),
      });
    },
  });
}

export function useSessionCashMovements(sessionId: string | undefined) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: posKeys.cashMovements(sessionId ?? ""),
    queryFn: isDemoMode ? () => [] : () => posApi.getSessionCashMovements(sessionId!),
    enabled: !!sessionId && !isDemoMode,
  });
}
