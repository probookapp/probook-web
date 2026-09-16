import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { pdf } from "@react-pdf/renderer";
import { toast } from "@/stores/useToastStore";
import { Download, Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui";
import { InvoicePDF } from "./InvoicePDF";
import { QuotePDF } from "./QuotePDF";
import { DeliveryNotePDF } from "./DeliveryNotePDF";
import { useLogoBase64 } from "@/features/settings";
import type { Invoice, Quote, DeliveryNote, CompanySettings } from "@/types";
import i18n from "@/i18n";
import { documentLocale, SERVER_DOCUMENT_LOCALES } from "./text";
import { registerClientFonts } from "./register-client-fonts";
import { useSettingsStore } from "@/stores/useSettingsStore";

/**
 * Whether a link with `download` actually saves a file here.
 *
 * iOS ignores the attribute for blob: URLs — the tap does nothing at all, which
 * is what a customer reports as "the PDF doesn't work". iPadOS reports itself
 * as a Mac, so the touch count is what tells them apart.
 */
/**
 * Put the finished document in the tab that was claimed for it.
 *
 * Not by pointing the tab at the blob: browsers refuse a top-level navigation to
 * a blob URL that another page created — Chromium leaves the tab blank, with no
 * error to catch. A frame may load it, so the tab gets a page of its own holding
 * the document, and a plain link above it for the case where even the frame is
 * refused: tapping that link is the reader's own gesture, which nothing blocks.
 */
function showInTab(tab: Window | null, url: string, fileName: string, openLabel: string) {
  if (!tab) {
    // Popups refused altogether: show the document here rather than nowhere.
    window.location.href = url;
    return;
  }
  const escape = (value: string) =>
    value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  tab.document.write(
    `<!doctype html><html><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width, initial-scale=1">` +
      `<title>${escape(fileName)}</title>` +
      `<style>html,body{margin:0;height:100%;font:16px/1.4 system-ui,sans-serif;background:#f5f4f1}` +
      `a{display:block;padding:14px 16px;color:#12333a;font-weight:600;text-decoration:none}` +
      `iframe{border:0;width:100%;height:calc(100% - 48px);display:block}</style></head><body>` +
      `<a href="${url}" download="${escape(fileName)}">${escape(openLabel)}</a>` +
      `<iframe src="${url}" title="${escape(fileName)}"></iframe></body></html>`
  );
  tab.document.close();
}

function canDownloadFiles(): boolean {
  if (typeof navigator === "undefined") return true;
  const ua = navigator.userAgent;
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  return !(/iPhone|iPad|iPod/.test(ua) || iPadOS);
}

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

  // Get filename based on document type
  const fileName = useMemo(() => {
    if (type === "invoice") {
      return `${(doc as Invoice).invoice_number}.pdf`;
    } else if (type === "quote") {
      return `${(doc as Quote).quote_number}.pdf`;
    } else {
      return `${(doc as DeliveryNote).delivery_note_number}.pdf`;
    }
  }, [type, doc]);

  // Determine which logo to use:
  // - For invoices: use stored logo_snapshot if issued/paid, otherwise use current logo
  // - For quotes: use stored logo_snapshot if sent/accepted, otherwise use current logo
  // - For delivery notes: use passed logoBase64 or current logo
  const logoToUse = useMemo(() => {
    if (type === "invoice") {
      const invoice = doc as Invoice;
      // Use stored snapshot for issued/paid invoices, current logo for drafts
      if (invoice.status !== "DRAFT" && invoice.logo_snapshot) {
        return invoice.logo_snapshot;
      }
    } else if (type === "quote") {
      const quote = doc as Quote;
      // Use stored snapshot for sent/accepted quotes, current logo for drafts
      if (quote.status !== "DRAFT" && quote.logo_snapshot) {
        return quote.logo_snapshot;
      }
    } else if (type === "delivery_note") {
      // Use passed logo or current logo for delivery notes
      const passedLogo = (props as DeliveryNotePDFViewerProps).logoBase64;
      if (passedLogo !== undefined) {
        return passedLogo;
      }
    }
    return currentLogo;
  }, [type, doc, currentLogo, props]);

  // Memoize the PDF document
  // Registered before the first document is built; a missing face makes the
  // render hang rather than fail.
  registerClientFonts();

  const PDFDocument = useMemo(() => {
    if (type === "invoice") {
      return <InvoicePDF invoice={doc as Invoice} company={company} logoBase64={logoToUse} locale={documentLocale(i18n.language, SERVER_DOCUMENT_LOCALES)}
          fontFamily={documentLocale(i18n.language, SERVER_DOCUMENT_LOCALES) === "ar" ? "IBM Plex Sans Arabic" : "IBM Plex Sans"}
          currency={useSettingsStore.getState().currency || "DZD"} />;
    } else if (type === "quote") {
      return <QuotePDF quote={doc as Quote} company={company} logoBase64={logoToUse} locale={documentLocale(i18n.language, SERVER_DOCUMENT_LOCALES)}
          fontFamily={documentLocale(i18n.language, SERVER_DOCUMENT_LOCALES) === "ar" ? "IBM Plex Sans Arabic" : "IBM Plex Sans"}
          currency={useSettingsStore.getState().currency || "DZD"} />;
    } else {
      return <DeliveryNotePDF deliveryNote={doc as DeliveryNote} company={company} logoBase64={logoToUse} locale={documentLocale(i18n.language, SERVER_DOCUMENT_LOCALES)}
          fontFamily={documentLocale(i18n.language, SERVER_DOCUMENT_LOCALES) === "ar" ? "IBM Plex Sans Arabic" : "IBM Plex Sans"} />;
    }
  }, [type, doc, company, logoToUse]);

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
      console.error("PDF preview failed", err);
      toast.error(t("pdfViewer.errorPreview"));
    } finally {
      setIsOpening(false);
    }
  }, [PDFDocument, fileName, t]);

  // Download PDF via browser download
  const handleDownload = useCallback(async () => {
    setIsDownloading(true);
    // Same reason as the preview: the tab has to exist before the await. It is
    // only used where a download link does nothing (iOS), and closed otherwise.
    const tab = canDownloadFiles() ? null : window.open("", "_blank");
    try {
      const blob = await pdf(PDFDocument).toBlob();
      const url = URL.createObjectURL(blob);

      if (tab) {
        // iOS ignores the download attribute on a blob: the file is shown
        // instead, and "Share → Save to Files" is how it gets saved there.
        showInTab(tab, url, fileName, t("pdfViewer.openPdf"));
      } else {
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

      // Not revoked on the next line: Firefox and Safari read the blob after
      // the click returns, and revoking it there cancelled the download.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success(t("pdfViewer.downloadSuccess", { path: fileName }));
    } catch (err) {
      tab?.close();
      console.error("PDF download failed", err);
      toast.error(t("pdfViewer.downloadError"));
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
