import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { pdf } from "@react-pdf/renderer";
import { toast } from "@/stores/useToastStore";
import { Download, Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui";
import { useLogoBase64 } from "@/features/settings";
import type { Invoice, Quote, DeliveryNote, CompanySettings } from "@/types";
import { claimDownloadTab, deliverPdf, reportPdfFailure, showInTab } from "./pdf-delivery";
import { documentElement, pdfFileName, pickLogo, type PdfDocument } from "./document-element";

interface InvoicePDFViewerProps {
  type: "invoice";
  document: Invoice;
  company: CompanySettings;
}

interface QuotePDFViewerProps {
  type: "quote";
  document: Quote;
  company: CompanySettings;
}

interface DeliveryNotePDFViewerProps {
  type: "delivery_note";
  document: DeliveryNote;
  company: CompanySettings;
  logoBase64?: string | null;
}

type PDFViewerProps = InvoicePDFViewerProps | QuotePDFViewerProps | DeliveryNotePDFViewerProps;

export function PDFViewer(props: PDFViewerProps) {
  const { type, document: doc, company } = props;
  const { t } = useTranslation("common");
  const [isOpening, setIsOpening] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const { data: currentLogo, isLoading: isLoadingLogo } = useLogoBase64();

  const input = useMemo(() => ({ type, document: doc }) as PdfDocument, [type, doc]);
  const fileName = useMemo(() => pdfFileName(input), [input]);

  // A delivery note shows the logo it was handed; anything else follows
  // pickLogo (snapshot once issued or sent, current logo on a draft).
  const passedLogo = type === "delivery_note" ? (props as DeliveryNotePDFViewerProps).logoBase64 : undefined;
  const PDFDocument = useMemo(
    () => documentElement(input, company, passedLogo !== undefined ? passedLogo : pickLogo(input, currentLogo)),
    [input, company, passedLogo, currentLogo]
  );

  // Open PDF in a new browser tab for preview/print
  const handleOpenPreview = useCallback(async () => {
    setIsOpening(true);
    // Claimed before the document is built, not after: a tab opened once an
    // await has resolved is no longer attributed to the tap that asked for it,
    // and Safari blocks it as a popup. On iPhone that was the whole feature —
    // the button span and nothing appeared.
    const tab = window.open("", "_blank");
    try {
      const blob = await pdf(PDFDocument).toBlob();
      const url = URL.createObjectURL(blob);
      showInTab(tab, url, fileName, t("pdfViewer.openPdf"));
    } catch (err) {
      tab?.close();
      toast.error(reportPdfFailure(err, "preview", t("pdfViewer.errorPreview")));
    } finally {
      setIsOpening(false);
    }
  }, [PDFDocument, fileName, t]);

  // Download PDF via browser download
  const handleDownload = useCallback(async () => {
    setIsDownloading(true);
    // Same reason as the preview: the tab has to exist before the await.
    const tab = claimDownloadTab();
    try {
      const blob = await pdf(PDFDocument).toBlob();
      deliverPdf(blob, fileName, tab, t("pdfViewer.openPdf"));
      toast.success(t("pdfViewer.downloadSuccess", { path: fileName }));
    } catch (err) {
      tab?.close();
      toast.error(reportPdfFailure(err, "download", t("pdfViewer.downloadError")));
    } finally {
      setIsDownloading(false);
    }
  }, [PDFDocument, fileName, t]);

  // Only wait for logo loading if we're showing a draft document or delivery note
  const needsCurrentLogo =
    (type === "invoice" && (doc as Invoice).status === "DRAFT") ||
    (type === "quote" && (doc as Quote).status === "DRAFT") ||
    (type === "delivery_note" && !(props as DeliveryNotePDFViewerProps).logoBase64);
  if (needsCurrentLogo && isLoadingLogo) {
    return (
      <div className="flex items-center gap-2 text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("pdfViewer.loading")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        size="sm"
        className="w-full justify-center"
        onClick={handleDownload}
        disabled={isDownloading}
      >
        {isDownloading ? (
          <Loader2 className="h-4 w-4 me-2 animate-spin" />
        ) : (
          <Download className="h-4 w-4 me-2" />
        )}
        {t("pdfViewer.downloadPdf")}
      </Button>

      <Button
        variant="secondary"
        size="sm"
        className="w-full justify-center"
        onClick={handleOpenPreview}
        disabled={isOpening}
      >
        {isOpening ? (
          <Loader2 className="h-4 w-4 me-2 animate-spin" />
        ) : (
          <Eye className="h-4 w-4 me-2" />
        )}
        {t("pdfViewer.preview")}
      </Button>
    </div>
  );
}
