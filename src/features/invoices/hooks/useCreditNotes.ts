import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { creditNoteApi } from "@/lib/api";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { LIST_PAGE_SIZE } from "@/lib/pagination";
import type { CreateCreditNoteInput, CursorPage, CreditNoteListItem } from "@/types";

export function useCreditNotes() {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["credit-notes", { demo: isDemoMode }],
    queryFn: isDemoMode ? () => [] : creditNoteApi.getAll,
    staleTime: isDemoMode ? Infinity : undefined,
  });
}

/** Cursor-paginated credit notes list (lean rows) for the list page. */
export function useInfiniteCreditNotes() {
  const { isDemoMode } = useDemoMode();
  return useInfiniteQuery({
    // Shares the ["credit-notes"] prefix so existing invalidations refresh it too.
    queryKey: ["credit-notes", "infinite", { demo: isDemoMode }],
    queryFn: isDemoMode
      ? (): CursorPage<CreditNoteListItem> => ({ data: [], next_cursor: null })
      : ({ pageParam }) => creditNoteApi.getPage({ limit: LIST_PAGE_SIZE, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
    staleTime: isDemoMode ? Infinity : undefined,
  });
}

export function useCreditNote(id: string) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["credit-notes", id, { demo: isDemoMode }],
    queryFn: () => creditNoteApi.getById(id),
    enabled: !!id && !isDemoMode,
  });
}

export function useCreateCreditNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCreditNoteInput) => creditNoteApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit-notes"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useDeleteCreditNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => creditNoteApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit-notes"] });
    },
  });
}
