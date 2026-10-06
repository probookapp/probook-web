import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tagApi } from "@/lib/api";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { DEMO_TAGS } from "@/lib/demo-data";
import type { TaggableDocument } from "@/lib/document-tags";
import type { TagInput } from "@/types";

/**
 * The tenant's labels.
 *
 * One hook rather than one per feature: the list page filters by them, the form
 * attaches them and the manager edits them, and all three have to agree about
 * what exists the moment one of them changes a name.
 */
export function useTags() {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["tags", { demo: isDemoMode }],
    queryFn: isDemoMode ? () => DEMO_TAGS : tagApi.getAll,
    staleTime: isDemoMode ? Infinity : undefined,
  });
}

/**
 * Anything that changes the labels themselves invalidates the quotes too: a
 * renamed or deleted label is printed on every row that wears it.
 */
function useTagInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["tags"] });
    queryClient.invalidateQueries({ queryKey: ["quotes"] });
  };
}

export function useCreateTag() {
  const refresh = useTagInvalidation();
  return useMutation({
    mutationFn: (input: TagInput) => tagApi.create(input),
    onSuccess: refresh,
  });
}

export function useUpdateTag() {
  const refresh = useTagInvalidation();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: TagInput }) => tagApi.update(id, input),
    onSuccess: refresh,
  });
}

export function useDeleteTag() {
  const refresh = useTagInvalidation();
  return useMutation({
    mutationFn: (id: string) => tagApi.delete(id),
    onSuccess: refresh,
  });
}

/** Which query keys a document type's lists and pages live under. */
const DOCUMENT_KEYS: Record<TaggableDocument, string> = {
  quotes: "quotes",
  invoices: "invoices",
  "delivery-notes": "deliveryNotes",
};

/**
 * Replace the labels on one document.
 *
 * Its own mutation rather than part of the document update, because labels are
 * not document data — see src/lib/document-tags-server.ts for why an issued
 * invoice depends on that.
 */
export function useSetDocumentTags(document: TaggableDocument) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tagIds }: { id: string; tagIds: string[] }) =>
      tagApi.setOn(document, id, tagIds),
    onSuccess: () => {
      // The list shows the chips too, so both have to hear about it.
      queryClient.invalidateQueries({ queryKey: [DOCUMENT_KEYS[document]] });
    },
  });
}
