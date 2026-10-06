"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ALL_STATUSES } from "@/lib/document-status";
import { useTagFilter } from "./useStatusFilter";
import { useTags } from "./useTags";

/**
 * The label chip row above a document list.
 *
 * One hook for the three lists that carry labels. Written once because the three
 * pages had already drifted on the state chips before `StatusFilterChips` pulled
 * them back together, and a second row of chips is a second chance to drift:
 * quotes filtering by label while invoices quietly did not would make the same
 * question answerable in one module and not the others.
 *
 * Labels narrow whatever state is selected rather than replacing it, which is
 * why this is a separate row and a separate query parameter.
 */
export function useTagListFilter() {
  const { t } = useTranslation("common");
  const [tagFilter, setTagFilter] = useTagFilter();
  const [tagsModalOpen, setTagsModalOpen] = useState(false);
  const { data: tags } = useTags();

  return {
    tagFilter,
    setTagFilter,
    /** Undefined for the unfiltered view, which is what the API expects. */
    tagQuery: tagFilter === ALL_STATUSES ? undefined : tagFilter,
    /** The chip row is hidden entirely until the business has invented a label. */
    hasTags: (tags?.length ?? 0) > 0,
    tagOptions: [
      { key: ALL_STATUSES, label: t("filters.all") },
      ...(tags ?? []).map((tag) => ({ key: tag.id, label: tag.name })),
    ],
    filterLabel: t("tags.filterByTag"),
    manageLabel: t("tags.manage"),
    tagsModalOpen,
    openTagsModal: () => setTagsModalOpen(true),
    closeTagsModal: () => setTagsModalOpen(false),
  };
}
