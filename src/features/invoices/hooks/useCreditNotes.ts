import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { creditNoteApi } from "@/lib/api";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import type { CreateCreditNoteInput } from "@/types";

export function useCreditNotes() {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["credit-notes", { demo: isDemoMode }],
    queryFn: isDemoMode ? () => [] : creditNoteApi.getAll,
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
