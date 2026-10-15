"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/stores/useToastStore";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { deliveryNoteApi, invoiceApi, quoteApi, settingsApi } from "@/lib/api";
import { DEMO_DELIVERY_NOTES } from "@/lib/demo-data/delivery-notes";
import { DEMO_INVOICES } from "@/lib/demo-data/invoices";
import { DEMO_QUOTES } from "@/lib/demo-data/quotes";
import { claimDownloadTab, deliverPdf, reportPdfFailure } from "./pdf-delivery";
import type { PdfDocument } from "./document-element";

type PdfType = PdfDocument["type"];

/**
 * Download a document's PDF straight from a list, without opening it.
 *
 * The list rows carry a summary, not the lines, so the full document is fetched
 * first (through the query cache, under the same key its view page uses). The
 * renderer is imported on the click, keeping @react-pdf/renderer out of the
 * list's own chunk.
 */
export function useDocumentPdfDownload() {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const { isDemoMode } = useDemoMode();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = (type: PdfType, id: string): Promise<PdfDocument> => {
    if (type === "invoice") {
      return queryClient
        .fetchQuery({
          queryKey: ["invoices", id, { demo: isDemoMode }],
          queryFn: () => (isDemoMode ? DEMO_INVOICES.find((d) => d.id === id) ?? DEMO_INVOICES[0] : invoiceApi.getById(id)),
        })
        .then((document) => ({ type, document }));
    }
    if (type === "quote") {
      return queryClient
        .fetchQuery({
          queryKey: ["quotes", id, { demo: isDemoMode }],
          queryFn: () => (isDemoMode ? DEMO_QUOTES.find((d) => d.id === id) ?? DEMO_QUOTES[0] : quoteApi.getById(id)),
        })
        .then((document) => ({ type, document }));
    }
    return (
      isDemoMode
        ? Promise.resolve(DEMO_DELIVERY_NOTES.find((d) => d.id === id) ?? DEMO_DELIVERY_NOTES[0])
        : queryClient.fetchQuery({ queryKey: ["deliveryNotes", id], queryFn: () => deliveryNoteApi.getById(id) })
    ).then((document) => ({ type, document }));
  };

  const download = async (type: PdfType, id: string) => {
    if (pendingId) return;
    setPendingId(id);
    const tab = claimDownloadTab();
    try {
      const [input, company, logo, renderer] = await Promise.all([
        load(type, id),
        queryClient.fetchQuery({ queryKey: ["company-settings"], queryFn: settingsApi.get }),
        queryClient.fetchQuery({ queryKey: ["logo-base64"], queryFn: settingsApi.getLogoBase64 }),
        import("./document-element"),
      ]);
      const blob = await renderer.renderDocumentPdf(input, company, logo);
      const fileName = renderer.pdfFileName(input);
      deliverPdf(blob, fileName, tab, t("pdfViewer.openPdf"));
      toast.success(t("pdfViewer.downloadSuccess", { path: fileName }));
    } catch (err) {
      tab?.close();
      toast.error(reportPdfFailure(err, "download", t("pdfViewer.downloadError")));
    } finally {
      setPendingId(null);
    }
  };

  return { download, pendingId };
}
