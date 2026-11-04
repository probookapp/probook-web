import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions-server";
import { num } from "@/lib/money";
import { buildFacturxXml } from "@/lib/facturx";
import { invoiceFooterMentions } from "@/lib/legal-mentions";
import { pdfString } from "@/features/pdf/strings";
import { DEFAULT_CURRENCY } from "@/lib/currencies";

/** UNTDID 4451 subject of each automatic mention, as the French rules expect. */
const NOTE_SUBJECTS: Record<string, string> = {
  "legal.fr.latePenalty": "PMD",
  "legal.fr.latePenaltyDefault": "PMD",
  "legal.fr.recoveryIndemnity": "PMT",
  "legal.fr.earlyDiscount": "AAB",
  "legal.fr.earlyDiscountNone": "AAB",
};

/** The first IBAN written in the free-text bank details, if any. */
function ibanIn(text: string | null | undefined): string | null {
  const match = (text ?? "").toUpperCase().match(/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,4})?\b/);
  return match ? match[0].replace(/\s/g, "") : null;
}

/**
 * The invoice's structured data, Factur-X CII at the EN 16931 profile
 * (src/lib/facturx.ts). The browser embeds it in the PDF it draws
 * (src/features/pdf/facturx-pdf.ts). A draft has no final number yet, so it
 * has no Factur-X either.
 */
export const GET = withAuth(async (req, { tenantId, session, params }) => {
  const denied = await requirePermission(session, "invoices", "view");
  if (denied) return denied;

  const [invoice, settings] = await Promise.all([
    prisma.invoice.findFirst({
      where: { tenantId, id: params?.id },
      include: {
        lines: { orderBy: { position: "asc" }, include: { product: { select: { unit: true } } } },
        client: true,
        payments: { select: { amount: true } },
      },
    }),
    prisma.companySettings.findFirst({ where: { tenantId } }),
  ]);
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (invoice.status === "DRAFT") {
    return NextResponse.json({ error: "Issue the invoice first", code: "INVOICE_DRAFT" }, { status: 400 });
  }

  const company = {
    fiscal_profile: settings?.fiscalProfile,
    vat_franchise: settings?.vatFranchise,
    vat_on_debits: settings?.vatOnDebits,
    late_penalty_rate: settings?.latePenaltyRate,
    early_payment_discount: settings?.earlyPaymentDiscount,
  };
  const client = { is_consumer: invoice.client.isConsumer };
  const notes = invoiceFooterMentions(company, client, {
    operation_nature: invoice.operationNature,
    vat_exemption: invoice.vatExemption,
    vat_exemption_note: invoice.vatExemptionNote,
    lines: invoice.lines.map((l) => ({ tax_rate: l.taxRate, is_subtotal_line: l.isSubtotalLine })),
  }).map((m) => ({ subject: NOTE_SUBJECTS[m.key] ?? "AAI", content: pdfString(m.key, "fr", m.values) }));
  if (settings?.legalMentions) notes.push({ subject: "AAI", content: settings.legalMentions });

  const xml = buildFacturxXml({
    number: invoice.invoiceNumber,
    typeCode: invoice.isDownPaymentInvoice ? "386" : "380",
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    currency: settings?.currency || DEFAULT_CURRENCY,
    seller: {
      name: settings?.companyName ?? "",
      siret: settings?.siret,
      vatNumber: settings?.vatFranchise ? null : settings?.vatNumber,
      address: settings?.address,
      postalCode: settings?.postalCode,
      city: settings?.city,
      country: settings?.country,
      email: settings?.email,
    },
    buyer: {
      name: invoice.client.name,
      siret: invoice.client.isConsumer ? null : invoice.client.siret,
      vatNumber: invoice.client.isConsumer ? null : invoice.client.vatNumber,
      address: invoice.client.address,
      postalCode: invoice.client.postalCode,
      city: invoice.client.city,
      country: invoice.client.country,
      email: invoice.client.email,
    },
    deliveryAddress: invoice.deliveryAddress,
    lines: invoice.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: num(l.unitPrice),
      taxRate: l.taxRate,
      discountPercent: l.discountPercent,
      unit: l.product?.unit ?? null,
      isSubtotalLine: l.isSubtotalLine,
      isBundleHeader: l.isBundleHeader,
    })),
    discountPercent: invoice.discountPercent,
    discountAmount: num(invoice.discountAmount),
    shippingCost: num(invoice.shippingCost),
    shippingTaxRate: invoice.shippingTaxRate,
    paidAmount: invoice.payments.reduce((s, p) => s + num(p.amount), 0),
    paymentMethod: invoice.paymentMethod,
    iban: ibanIn(settings?.bankDetails),
    vatFranchise: !!settings?.vatFranchise,
    vatExemption: invoice.vatExemption,
    vatExemptionNote: invoice.vatExemptionNote,
    vatOnDebits: !!settings?.vatOnDebits,
    operationNature: invoice.operationNature,
    notes,
  });

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${invoice.invoiceNumber}-factur-x.xml"`,
    },
  });
});
