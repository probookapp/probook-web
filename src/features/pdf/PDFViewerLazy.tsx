"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

/**
 * Lazily-loaded PDFViewer. @react-pdf/renderer is a heavy dependency, so view
 * pages import this wrapper instead of PDFViewer directly — the renderer and
 * the PDF document components are split into their own chunk and only fetched
 * when a document view actually renders.
 */
export const PDFViewer = dynamic(() => import("./PDFViewer").then((mod) => mod.PDFViewer), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-4 text-gray-500">
      <Loader2 className="h-4 w-4 animate-spin" />
    </div>
  ),
});
