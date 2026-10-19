import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supplierCreditApi } from "@/lib/api";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { useToastStore } from "@/stores/useToastStore";
import type { CreateSupplierAdjustmentInput, SupplierBalance } from "@/types";

/**
 * Everything that shows a supplier's balance. A payment, an adjustment, a
 * return or a receipt paid from the till changes all of them at once.
 */
export function invalidateSupplierAccount(queryClient: QueryClient) {
  for (const key of [
    "supplier-credits",
    "supplier-payments",
    "supplier-statement",
    "supplier-balances",
  ]) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
}

/** Balance per supplier for the list: positive = owed, negative = credit held. */
export function useSupplierBalances() {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["supplier-balances", { demo: isDemoMode }],
    queryFn: async (): Promise<Map<string, number>> => {
      const rows: SupplierBalance[] = isDemoMode ? [] : await supplierCreditApi.getBalances();
      return new Map(rows.map((r) => [r.supplier_id, r.balance]));
    },
    staleTime: isDemoMode ? Infinity : undefined,
  });
}

/** Supplier ledger for a date range. Only fetched when enabled (non-demo). */
export function useSupplierStatement(
  supplierId: string | null,
  range: { startDate?: string; endDate?: string }
) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["supplier-statement", supplierId, range],
    queryFn: () => supplierCreditApi.getStatement(supplierId as string, range),
    enabled: !!supplierId && !isDemoMode,
  });
}

export function useCreateSupplierAdjustment(supplierId: string) {
  const queryClient = useQueryClient();
  const addToast = useToastStore((state) => state.addToast);
  const { t } = useTranslation("suppliers");
  return useMutation({
    mutationFn: (input: CreateSupplierAdjustmentInput) =>
      supplierCreditApi.createAdjustment(supplierId, input),
    onSuccess: () => {
      invalidateSupplierAccount(queryClient);
      addToast({ type: "success", message: t("adjustment.saved") });
    },
    onError: () => {
      addToast({ type: "error", message: t("adjustment.error") });
    },
  });
}

export function useDeleteSupplierAdjustment(supplierId: string) {
  const queryClient = useQueryClient();
  const addToast = useToastStore((state) => state.addToast);
  const { t } = useTranslation("suppliers");
  const { t: tCommon } = useTranslation("common");
  return useMutation({
    mutationFn: (id: string) => supplierCreditApi.deleteAdjustment(supplierId, id),
    onSuccess: () => {
      invalidateSupplierAccount(queryClient);
      addToast({ type: "success", message: t("adjustment.deleted") });
    },
    onError: () => {
      addToast({ type: "error", message: tCommon("messages.error") });
    },
  });
}
