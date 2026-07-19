"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

/**
 * Lazily-loaded RichTextEditor. Tiptap (and its extensions) are heavy, so form
 * pages import this wrapper instead of RichTextEditor directly — the editor is
 * split into its own chunk and only fetched when a form actually renders it.
 * The placeholder mirrors the editor container to avoid layout shift.
 */
export const RichTextEditor = dynamic(
  () => import("./RichTextEditor").then((mod) => mod.RichTextEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center min-h-[136px] border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    ),
  }
);
