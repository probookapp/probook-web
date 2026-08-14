"use client";

import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { usePathname } from "@/lib/navigation";
import { ALL_STATUSES, ARCHIVED_FILTER } from "@/lib/document-status";

/**
 * The selected state of a document list, kept in the URL.
 *
 * In the URL rather than in component state so a dashboard card can link
 * straight to "the unpaid invoices" and land on a list that is already
 * filtered — and so that view can be bookmarked or sent to a colleague.
 *
 * The URL is rewritten with history.replaceState rather than a router push:
 * clicking through four chips should not put four entries in the back button.
 */
export function useStatusFilter(allowed: readonly string[]): [string, (next: string) => void] {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const fromUrl = searchParams?.get("status")?.toUpperCase() ?? null;
  // ARCHIVED is a chip like the others as far as the URL is concerned, even
  // though the server reads it as a different parameter.
  const selectable = [ALL_STATUSES, ARCHIVED_FILTER, ...allowed];
  const initial = fromUrl && selectable.includes(fromUrl) ? fromUrl : ALL_STATUSES;

  const [value, setValue] = useState(initial);

  const set = useCallback(
    (next: string) => {
      setValue(next);
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      if (next === ALL_STATUSES) params.delete("status");
      else params.set("status", next);
      const query = params.toString();
      window.history.replaceState(null, "", `${pathname}${query ? `?${query}` : ""}`);
    },
    [pathname]
  );

  return [value, set];
}
