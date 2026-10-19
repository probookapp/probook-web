import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { purchaseApi } from "@/lib/api";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { useToastStore } from "@/stores/useToastStore";
import { useTranslation } from "react-i18next";
import { DEMO_PURCHASES } from "@/lib/demo-data";
import { LIST_PAGE_SIZE } from "@/lib/pagination";
import { isApiError } from "@/lib/api-adapter";
import { invalidateSupplierAccount } from "@/features/suppliers/hooks/useSupplierAccount";
import type {
  CreatePurchaseOrderInput,
  UpdatePurchaseOrderInput,
  ConfirmPurchaseOrderInput,
  CursorPage,
  PurchaseOrderListItem,
} from "@/types";

export function usePurchases() {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["purchases", { demo: isDemoMode }],
    queryFn: isDemoMode ? () => DEMO_PURCHASES : purchaseApi.getAll,
    staleTime: isDemoMode ? Infinity : undefined,
  });
}

/**
 * Cursor-paginated purchases list (lean rows, no lines) for the list page.
 * Edit/confirm flows fetch the full order via usePurchase(id).
 */
export function useInfinitePurchases() {
  const { isDemoMode } = useDemoMode();
  return useInfiniteQuery({
    // Shares the ["purchases"] prefix so existing invalidations refresh it too.
    queryKey: ["purchases", "infinite", { demo: isDemoMode }],
    queryFn: isDemoMode
      ? (): CursorPage<PurchaseOrderListItem> => ({ data: DEMO_PURCHASES, next_cursor: null })
      : ({ pageParam }) => purchaseApi.getPage({ limit: LIST_PAGE_SIZE, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
    staleTime: isDemoMode ? Infinity : undefined,
  });
}

export function usePurchase(id: string) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["purchases", id, { demo: isDemoMode }],
    // The demo orders already carry their lines: the order page reads them as is.
    queryFn: isDemoMode
      ? () => {
          const order = DEMO_PURCHASES.find((p) => p.id === id);
          if (!order) throw new Error("Purchase order not found");
          return order;
        }
      : () => purchaseApi.getById(id),
    enabled: !!id,
    staleTime: isDemoMode ? Infinity : undefined,
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
    onError: (err) => {
      addToast({
        type: "error",
        // An advance was paid on it: it can be cancelled, not deleted.
        message: isApiError(err, 409) ? t("messages.deleteHasPayments") : t("messages.deleteError"),
      });
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
      queryClient.invalidateQueries({ queryKey: ["pos-products"] });
      // A receipt paid from the till is a supplier payment too.
      invalidateSupplierAccount(queryClient);
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
