import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { purchaseApi } from "@/lib/api";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { useToastStore } from "@/stores/useToastStore";
import { useTranslation } from "react-i18next";
import { DEMO_PURCHASES } from "@/lib/demo-data";
import type {
  CreatePurchaseOrderInput,
  UpdatePurchaseOrderInput,
  ConfirmPurchaseOrderInput,
} from "@/types";

export function usePurchases() {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["purchases", { demo: isDemoMode }],
    queryFn: isDemoMode ? () => DEMO_PURCHASES : purchaseApi.getAll,
    staleTime: isDemoMode ? Infinity : undefined,
  });
}

export function usePurchase(id: string) {
  return useQuery({
    queryKey: ["purchases", id],
    queryFn: () => purchaseApi.getById(id),
    enabled: !!id,
  });
}

export function useCreatePurchase() {
  const queryClient = useQueryClient();
  const addToast = useToastStore((state) => state.addToast);
  const { t } = useTranslation("purchases");

  return useMutation({
    mutationFn: (input: CreatePurchaseOrderInput) => purchaseApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      addToast({ type: "success", message: t("messages.created") });
    },
    onError: () => {
      addToast({ type: "error", message: t("messages.createError") });
    },
  });
}

export function useUpdatePurchase() {
  const queryClient = useQueryClient();
  const addToast = useToastStore((state) => state.addToast);
  const { t } = useTranslation("purchases");

  return useMutation({
    mutationFn: (input: UpdatePurchaseOrderInput) => purchaseApi.update(input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      queryClient.invalidateQueries({ queryKey: ["purchases", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      addToast({ type: "success", message: t("messages.updated") });
    },
    onError: () => {
      addToast({ type: "error", message: t("messages.updateError") });
    },
  });
}

export function useDeletePurchase() {
  const queryClient = useQueryClient();
  const addToast = useToastStore((state) => state.addToast);
  const { t } = useTranslation("purchases");

  return useMutation({
    mutationFn: (id: string) => purchaseApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      addToast({ type: "success", message: t("messages.deleted") });
    },
    onError: () => {
      addToast({ type: "error", message: t("messages.deleteError") });
    },
  });
}

export function useBatchDeletePurchases() {
  const queryClient = useQueryClient();
  const addToast = useToastStore((state) => state.addToast);
  const { t: tCommon } = useTranslation("common");

  return useMutation({
    mutationFn: (ids: string[]) => purchaseApi.batchDelete(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      addToast({ type: "success", message: tCommon("bulk.deleted") });
    },
    onError: () => {
      addToast({ type: "error", message: tCommon("bulk.deleteError") });
    },
  });
}

export function useConfirmPurchase() {
  const queryClient = useQueryClient();
  const addToast = useToastStore((state) => state.addToast);
  const { t } = useTranslation("purchases");

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ConfirmPurchaseOrderInput }) =>
      purchaseApi.confirm(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      addToast({ type: "success", message: t("messages.confirmed") });
    },
    onError: () => {
      addToast({ type: "error", message: t("messages.confirmError") });
    },
  });
}

export function useCancelPurchase() {
  const queryClient = useQueryClient();
  const addToast = useToastStore((state) => state.addToast);
  const { t } = useTranslation("purchases");

  return useMutation({
    mutationFn: (id: string) => purchaseApi.cancel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      addToast({ type: "success", message: t("messages.cancelled") });
    },
    onError: () => {
      addToast({ type: "error", message: t("messages.cancelError") });
    },
  });
}
