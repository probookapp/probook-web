import { pdf } from "@react-pdf/renderer";
import { InvoicePDF } from "./InvoicePDF";
import { QuotePDF } from "./QuotePDF";
import { DeliveryNotePDF } from "./DeliveryNotePDF";
import type { Invoice, Quote, DeliveryNote, CompanySettings } from "@/types";
import i18n from "@/i18n";
import { documentLocale, SERVER_DOCUMENT_LOCALES } from "./text";
import { registerClientFonts } from "./register-client-fonts";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { DEFAULT_CURRENCY } from "@/lib/currencies";

export type PdfDocument =
  | { type: "invoice"; document: Invoice }
  | { type: "quote"; document: Quote }
  | { type: "delivery_note"; document: DeliveryNote };

export function pdfFileName({ type, document: doc }: PdfDocument): string {
  if (type === "invoice") return `${doc.invoice_number}.pdf`;
  if (type === "quote") return `${doc.quote_number}.pdf`;
  return `${doc.delivery_note_number}.pdf`;
}

/**
 * Which logo the document carries: an issued invoice or a sent quote keeps the
 * logo it went out with (logo_snapshot); a draft, or a delivery note, takes the
 * company's current one.
 */
export function pickLogo(input: PdfDocument, currentLogo: string | null | undefined): string | null | undefined {
  if (input.type === "invoice" || input.type === "quote") {
    const doc = input.document;
    if (doc.status !== "DRAFT" && doc.logo_snapshot) return doc.logo_snapshot;
  }
  return currentLogo;
}

/** The react-pdf element for a document, in the reader's language. */
export function documentElement(input: PdfDocument, company: CompanySettings, logoBase64: string | null | undefined) {
  // Registered before the first document is built; a missing face makes the
  // render hang rather than fail.
  registerClientFonts();
  const locale = documentLocale(i18n.language, SERVER_DOCUMENT_LOCALES);
  const fontFamily = locale === "ar" ? "IBM Plex Sans Arabic" : "IBM Plex Sans";
  const currency = useSettingsStore.getState().currency || DEFAULT_CURRENCY;

  if (input.type === "invoice") {
    return <InvoicePDF invoice={input.document} company={company} logoBase64={logoBase64} locale={locale} fontFamily={fontFamily} currency={currency} />;
  }
  if (input.type === "quote") {
    return <QuotePDF quote={input.document} company={company} logoBase64={logoBase64} locale={locale} fontFamily={fontFamily} currency={currency} />;
  }
  return <DeliveryNotePDF deliveryNote={input.document} company={company} logoBase64={logoBase64} locale={locale} fontFamily={fontFamily} />;
}

/** Render straight to a Blob — for a download that never shows the viewer. */
export function renderDocumentPdf(input: PdfDocument, company: CompanySettings, currentLogo: string | null | undefined) {
  return pdf(documentElement(input, company, pickLogo(input, currentLogo))).toBlob();
}
