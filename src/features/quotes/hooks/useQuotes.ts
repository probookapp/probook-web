import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { quoteApi } from "@/lib/api";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { DEMO_QUOTES } from "@/lib/demo-data";
import { LIST_PAGE_SIZE } from "@/lib/pagination";
import { filterByStatus } from "@/lib/document-status";
import type { CreateQuoteInput, UpdateQuoteInput, CursorPage, QuoteListItem } from "@/types";

export function useQuotes() {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["quotes", { demo: isDemoMode }],
    queryFn: isDemoMode ? () => DEMO_QUOTES : quoteApi.getAll,
    staleTime: isDemoMode ? Infinity : undefined,
  });
}

/** Cursor-paginated quotes list (lean rows) for the quotes list page. */
/** `status` is a comma-separated list of states, or undefined for every state. */
export function useInfiniteQuotes(status?: string, archived?: string) {
  const { isDemoMode } = useDemoMode();
  return useInfiniteQuery({
    // Shares the ["quotes"] prefix so existing invalidations refresh it too.
    queryKey: ["quotes", "infinite", status ?? null, archived ?? null, { demo: isDemoMode }],
    queryFn: isDemoMode
      ? (): CursorPage<QuoteListItem> => ({
          data: filterByStatus(DEMO_QUOTES, status),
          next_cursor: null,
        })
      : ({ pageParam }) => quoteApi.getPage({ limit: LIST_PAGE_SIZE, cursor: pageParam, status, archived }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
    staleTime: isDemoMode ? Infinity : undefined,
  });
}

export function useQuote(id: string) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["quotes", id, { demo: isDemoMode }],
    queryFn: isDemoMode
      ? () => DEMO_QUOTES.find((q) => q.id === id) ?? DEMO_QUOTES[0]
      : () => quoteApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateQuote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateQuoteInput) => quoteApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useUpdateQuote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateQuoteInput) => quoteApi.update(input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["quotes", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useDeleteQuote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => quoteApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useConvertQuoteToInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => quoteApi.convertToInvoice(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useDuplicateQuote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => quoteApi.duplicate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useConvertQuoteToDeliveryNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => quoteApi.convertToDeliveryNote(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["deliveryNotes"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useBatchDeleteQuotes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => quoteApi.batchDelete(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

/**
 * Put a document away, or bring it back.
 *
 * Archiving never changes what the document is worth or what it declares —
 * it only leaves the working list. See src/lib/archive-server.ts.
 */
export function useArchiveQuote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      archived ? quoteApi.archive(id) : quoteApi.unarchive(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
    },
  });
}
