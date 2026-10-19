import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supplierReturnApi } from "@/lib/api";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { useToastStore } from "@/stores/useToastStore";
import { LIST_PAGE_SIZE } from "@/lib/pagination";
import { invalidateSupplierAccount } from "@/features/suppliers/hooks/useSupplierAccount";
import type { CreateSupplierReturnInput, CursorPage, SupplierReturn } from "@/types";

export function useInfiniteSupplierReturns() {
  const { isDemoMode } = useDemoMode();
  return useInfiniteQuery({
    queryKey: ["supplier-returns", "infinite", { demo: isDemoMode }],
    queryFn: isDemoMode
      ? (): CursorPage<SupplierReturn> => ({ data: [], next_cursor: null })
      : ({ pageParam }) => supplierReturnApi.getPage({ limit: LIST_PAGE_SIZE, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
    staleTime: isDemoMode ? Infinity : undefined,
  });
}

export function useSupplierReturn(id: string) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["supplier-returns", id],
    queryFn: () => supplierReturnApi.getById(id),
    enabled: !!id && !isDemoMode,
  });
}

/** The returns made against one purchase order, for its page. */
export function useOrderReturns(purchaseOrderId: string | null) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["supplier-returns", "order", purchaseOrderId],
    queryFn: () => supplierReturnApi.getForOrder(purchaseOrderId as string),
    enabled: !!purchaseOrderId && !isDemoMode,
  });
}

function useInvalidateReturns() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["supplier-returns"] });
    // A return moves stock and changes the order's payment status.
    queryClient.invalidateQueries({ queryKey: ["purchases"] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["products-with-details"] });
    queryClient.invalidateQueries({ queryKey: ["pos-products"] });
    invalidateSupplierAccount(queryClient);
  };
}

export function useCreateSupplierReturn() {
  const invalidate = useInvalidateReturns();
  const addToast = useToastStore((state) => state.addToast);
  const { t } = useTranslation("purchases");
  return useMutation({
    mutationFn: (input: CreateSupplierReturnInput) => supplierReturnApi.create(input),
    onSuccess: () => {
      invalidate();
      addToast({ type: "success", message: t("returns.created") });
    },
  });
}

export function useDeleteSupplierReturn() {
  const invalidate = useInvalidateReturns();
  const addToast = useToastStore((state) => state.addToast);
  const { t } = useTranslation("purchases");
  const { t: tCommon } = useTranslation("common");
  return useMutation({
    mutationFn: (id: string) => supplierReturnApi.delete(id),
    onSuccess: () => {
      invalidate();
      addToast({ type: "success", message: t("returns.deleted") });
    },
    onError: () => {
      addToast({ type: "error", message: tCommon("messages.error") });
    },
  });
}
