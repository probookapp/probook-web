import type { CompanySettings, CreditNote, Invoice } from "@/types";
import { DEFAULT_CURRENCY } from "@/lib/currencies";
import { API_BASE_URL } from "@/lib/config";
import { pickLogo, renderDocumentPdf } from "./document-element";
import { embedFacturx } from "./facturx-pdf";
import { legalCompanyName } from "@/lib/legal-mentions";

export class FacturxUnavailable extends Error {}

/**
 * The invoice as a Factur-X: the same PDF the customer reads, drawn here with
 * embedded fonts, carrying the XML the server builds from the stored invoice.
 */
export async function renderFacturxPdf(
  invoice: Invoice,
  company: CompanySettings,
  currentLogo: string | null | undefined
): Promise<Blob> {
  const res = await fetch(`${API_BASE_URL}/api/invoices/${invoice.id}/facturx`, { credentials: "include" });
  if (!res.ok) throw new FacturxUnavailable(`Factur-X data unavailable (${res.status})`);
  const xml = await res.text();
  const pdf = await renderDocumentPdf({ type: "invoice", document: invoice }, company, pickLogo({ type: "invoice", document: invoice }, currentLogo));
  const bytes = await embedFacturx(await pdf.arrayBuffer(), xml, {
    title: `Facture ${invoice.invoice_number}`,
    author: legalCompanyName(company),
    date: new Date(),
  });
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

/** A credit note's PDF, in the reader's language, with embedded fonts. */
export async function renderCreditNotePdf(
  creditNote: CreditNote,
  company: CompanySettings,
  logo: string | null | undefined
): Promise<Blob> {
  const [{ pdf }, { CreditNotePDF }, { registerClientFonts }, { documentLocale, SERVER_DOCUMENT_LOCALES }, i18n] =
    await Promise.all([
      import("@react-pdf/renderer"),
      import("./CreditNotePDF"),
      import("./register-client-fonts"),
      import("./text"),
      import("@/i18n").then((m) => m.default),
    ]);
  registerClientFonts();
  const locale = documentLocale(i18n.language, SERVER_DOCUMENT_LOCALES);
  const fontFamily = locale === "ar" ? "IBM Plex Sans Arabic" : "IBM Plex Sans";
  return pdf(
    <CreditNotePDF
      creditNote={creditNote}
      company={company}
      logoBase64={logo}
      locale={locale}
      fontFamily={fontFamily}
      currency={company.currency || DEFAULT_CURRENCY}
    />
  ).toBlob();
}

/** The credit note as a Factur-X (type 381). */
export async function renderCreditNoteFacturx(
  creditNote: CreditNote,
  company: CompanySettings,
  logo: string | null | undefined
): Promise<Blob> {
  const res = await fetch(`${API_BASE_URL}/api/credit-notes/${creditNote.id}/facturx`, { credentials: "include" });
  if (!res.ok) throw new FacturxUnavailable(`Factur-X data unavailable (${res.status})`);
  const xml = await res.text();
  const pdf = await renderCreditNotePdf(creditNote, company, logo);
  const bytes = await embedFacturx(await pdf.arrayBuffer(), xml, {
    title: `Avoir ${creditNote.credit_note_number}`,
    author: legalCompanyName(company),
    date: new Date(),
  });
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}
