import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions-server";
import { num } from "@/lib/money";
import { buildFacturxXml } from "@/lib/facturx";
import { DEFAULT_CURRENCY } from "@/lib/currencies";

/**
 * A credit note's structured data: Factur-X CII, type 381, naming the invoice
 * it corrects (BT-25/BT-26). Lines are stated as stored on the credit note,
 * with positive amounts: the type code is what says the money flows back.
 */
export const GET = withAuth(async (req, { tenantId, session, params }) => {
  const denied = await requirePermission(session, "invoices", "view");
  if (denied) return denied;

  const [creditNote, settings] = await Promise.all([
    prisma.creditNote.findFirst({
      where: { tenantId, id: params?.id },
      include: {
        lines: true,
        client: true,
        invoice: { select: { invoiceNumber: true, issueDate: true } },
      },
    }),
    prisma.companySettings.findFirst({ where: { tenantId } }),
  ]);
  if (!creditNote) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (creditNote.status === "DRAFT") {
    return NextResponse.json({ error: "Issue the credit note first", code: "CREDIT_NOTE_DRAFT" }, { status: 400 });
  }

  // Credit note lines keep the product id but no relation: units by lookup.
  const productIds = [...new Set(creditNote.lines.map((l) => l.productId).filter((id): id is string => !!id))];
  const units = new Map(
    (productIds.length
      ? await prisma.product.findMany({ where: { tenantId, id: { in: productIds } }, select: { id: true, unit: true } })
      : []
    ).map((p) => [p.id, p.unit])
  );

  const xml = buildFacturxXml({
    number: creditNote.creditNoteNumber,
    typeCode: "381",
    issueDate: creditNote.issueDate,
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
      name: creditNote.client.name,
      siret: creditNote.client.isConsumer ? null : creditNote.client.siret,
      vatNumber: creditNote.client.isConsumer ? null : creditNote.client.vatNumber,
      address: creditNote.client.address,
      postalCode: creditNote.client.postalCode,
      city: creditNote.client.city,
      country: creditNote.client.country,
      email: creditNote.client.email,
    },
    lines: creditNote.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: num(l.unitPrice),
      taxRate: l.taxRate,
      unit: l.productId ? (units.get(l.productId) ?? null) : null,
    })),
    vatFranchise: !!settings?.vatFranchise,
    precedingInvoice: creditNote.invoice
      ? { number: creditNote.invoice.invoiceNumber, issueDate: creditNote.invoice.issueDate }
      : null,
    paymentTerms: "Avoir à déduire du prochain règlement ou à rembourser.",
    notes: creditNote.reason ? [{ subject: "AAI", content: creditNote.reason }] : [],
  });

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${creditNote.creditNoteNumber}-factur-x.xml"`,
    },
  });
});
