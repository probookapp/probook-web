"use client";

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui";

interface LoadMoreSentinelProps {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  /** Number of rows currently loaded — used to hide the end-of-list note on empty lists. */
  loadedCount: number;
}

/**
 * Shared "load more" trigger for cursor-paginated lists.
 *
 * Single pattern used across all list pages: an IntersectionObserver sentinel
 * that auto-fetches the next page when scrolled into view, rendering a visible
 * "Load more" button as its content (manual fallback if the observer never
 * fires, e.g. inside unusual scroll containers). Shows a short "end of list"
 * note once every page is loaded.
 */
export function LoadMoreSentinel({
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  loadedCount,
}: LoadMoreSentinelProps) {
  const { t } = useTranslation("common");
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (!hasNextPage) {
    if (loadedCount === 0) return null;
    return (
      <p className="py-3 text-center text-xs text-gray-400 dark:text-gray-500">
        {t("pagination.endOfList")}
      </p>
    );
  }

  return (
    <div ref={sentinelRef} className="flex justify-center py-3">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => fetchNextPage()}
        isLoading={isFetchingNextPage}
      >
        {t("pagination.loadMore")}
      </Button>
    </div>
  );
}
