import type { CompanySettings, Invoice } from "@/types";
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
