import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { deliveryNoteApi } from "@/lib/api";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { DEMO_DELIVERY_NOTES } from "@/lib/demo-data";
import { LIST_PAGE_SIZE } from "@/lib/pagination";
import type {
  CreateDeliveryNoteInput,
  UpdateDeliveryNoteInput,
  CursorPage,
  DeliveryNoteListItem,
} from "@/types";

export function useDeliveryNotes() {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["deliveryNotes", { demo: isDemoMode }],
    queryFn: isDemoMode ? () => DEMO_DELIVERY_NOTES : deliveryNoteApi.getAll,
    staleTime: isDemoMode ? Infinity : undefined,
  });
}

/** Cursor-paginated delivery notes list (lean rows) for the list page. */
export function useInfiniteDeliveryNotes() {
  const { isDemoMode } = useDemoMode();
  return useInfiniteQuery({
    // Shares the ["deliveryNotes"] prefix so existing invalidations refresh it too.
    queryKey: ["deliveryNotes", "infinite", { demo: isDemoMode }],
    queryFn: isDemoMode
      ? (): CursorPage<DeliveryNoteListItem> => ({ data: DEMO_DELIVERY_NOTES, next_cursor: null })
      : ({ pageParam }) => deliveryNoteApi.getPage({ limit: LIST_PAGE_SIZE, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
    staleTime: isDemoMode ? Infinity : undefined,
  });
}

export function useDeliveryNote(id: string) {
  return useQuery({
    queryKey: ["deliveryNotes", id],
    queryFn: () => deliveryNoteApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateDeliveryNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateDeliveryNoteInput) => deliveryNoteApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deliveryNotes"] });
    },
  });
}

export function useUpdateDeliveryNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateDeliveryNoteInput) => deliveryNoteApi.update(input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["deliveryNotes"] });
      queryClient.invalidateQueries({ queryKey: ["deliveryNotes", variables.id] });
    },
  });
}

export function useDeleteDeliveryNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deliveryNoteApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deliveryNotes"] });
    },
  });
}

export function useDuplicateDeliveryNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deliveryNoteApi.duplicate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deliveryNotes"] });
    },
  });
}

export function useConvertDeliveryNoteToInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deliveryNoteApi.convertToInvoice(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["deliveryNotes"] });
    },
  });
}

export function useBatchDeleteDeliveryNotes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => deliveryNoteApi.batchDelete(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deliveryNotes"] });
    },
  });
}
