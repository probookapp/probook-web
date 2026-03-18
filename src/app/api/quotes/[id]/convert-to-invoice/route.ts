import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export const POST = withAuth(async (req, { tenantId, params }) => {
  const quote = await prisma.quote.findFirst({
    where: { tenantId, id: params?.id },
    include: { lines: { orderBy: { position: "asc" } } },
  });
  if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const settings = await prisma.companySettings.findFirst({ where: { tenantId } });
  const nextNum = settings?.nextInvoiceNumber ?? 1;
  const prefix = settings?.invoicePrefix ?? "INV-";
  const invoiceNumber = `${prefix}${String(nextNum).padStart(5, "0")}`;
  const paymentTerms = settings?.defaultPaymentTerms ?? 30;

  const invoice = await prisma.invoice.create({
    data: {
      tenantId,
      invoiceNumber,
      clientId: quote.clientId,
      quoteId: quote.id,
      status: "DRAFT",
      issueDate: new Date(),
      dueDate: new Date(Date.now() + paymentTerms * 24 * 60 * 60 * 1000),
      subtotal: quote.subtotal,
      taxAmount: quote.taxAmount,
      total: quote.total,
      notes: quote.notes,
      notesHtml: quote.notesHtml,
      shippingCost: quote.shippingCost,
      shippingTaxRate: quote.shippingTaxRate,
      downPaymentPercent: quote.downPaymentPercent,
      downPaymentAmount: quote.downPaymentAmount,
      lines: {
        create: quote.lines.map((line) => ({
          productId: line.productId,
          description: line.description,
          descriptionHtml: line.descriptionHtml,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          taxRate: line.taxRate,
          subtotal: line.subtotal,
          taxAmount: line.taxAmount,
          total: line.total,
          position: line.position,
          groupName: line.groupName,
          isSubtotalLine: line.isSubtotalLine,
        })),
      },
    },
    include: { lines: { orderBy: { position: "asc" } }, client: true, payments: true },
  });

  if (settings) {
    await prisma.companySettings.update({
      where: { id: settings.id },
      data: { nextInvoiceNumber: nextNum + 1 },
    });
  }

  return NextResponse.json(toSnakeCase(invoice));
});
