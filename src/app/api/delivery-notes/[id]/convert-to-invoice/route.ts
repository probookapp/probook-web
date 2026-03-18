import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export const POST = withAuth(async (req, { tenantId, params }) => {
  const note = await prisma.deliveryNote.findFirst({
    where: { tenantId, id: params?.id },
    include: { lines: { orderBy: { position: "asc" } } },
  });
  if (!note) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const settings = await prisma.companySettings.findFirst({ where: { tenantId } });
  const nextNum = settings?.nextInvoiceNumber ?? 1;
  const prefix = settings?.invoicePrefix ?? "INV-";
  const invoiceNumber = `${prefix}${String(nextNum).padStart(5, "0")}`;
  const paymentTerms = settings?.defaultPaymentTerms ?? 30;
  const defaultTaxRate = settings?.defaultTaxRate ?? 20;

  // Build invoice lines from delivery note lines with product pricing
  const invoiceLines: {
    productId: string | null;
    description: string;
    descriptionHtml: string | null;
    quantity: number;
    unitPrice: number;
    taxRate: number;
    subtotal: number;
    taxAmount: number;
    total: number;
    position: number;
    groupName: string | null;
    isSubtotalLine: boolean;
  }[] = [];
  let subtotal = 0;
  let taxAmount = 0;

  for (const line of note.lines) {
    let unitPrice = 0;
    let taxRate = defaultTaxRate;
    if (line.productId) {
      const product = await prisma.product.findFirst({ where: { tenantId, id: line.productId } });
      if (product) {
        unitPrice = product.unitPrice;
        taxRate = product.taxRate;
      }
    }
    const lineHt = line.quantity * unitPrice;
    const lineVat = lineHt * (taxRate / 100);
    subtotal += lineHt;
    taxAmount += lineVat;

    invoiceLines.push({
      productId: line.productId,
      description: line.description,
      descriptionHtml: line.descriptionHtml,
      quantity: line.quantity,
      unitPrice,
      taxRate,
      subtotal: lineHt,
      taxAmount: lineVat,
      total: lineHt + lineVat,
      position: line.position,
      groupName: null,
      isSubtotalLine: false,
    });
  }

  const total = subtotal + taxAmount;

  const invoice = await prisma.invoice.create({
    data: {
      tenantId,
      invoiceNumber,
      clientId: note.clientId,
      status: "DRAFT",
      issueDate: new Date(),
      dueDate: new Date(Date.now() + paymentTerms * 24 * 60 * 60 * 1000),
      subtotal,
      taxAmount,
      total,
      lines: { create: invoiceLines },
    },
    include: { lines: { orderBy: { position: "asc" } }, client: true, payments: true },
  });

  // Link delivery note to invoice
  await prisma.deliveryNote.update({
    where: { tenantId, id: note.id },
    data: { invoiceId: invoice.id },
  });

  if (settings) {
    await prisma.companySettings.update({
      where: { id: settings.id },
      data: { nextInvoiceNumber: nextNum + 1 },
    });
  }

  return NextResponse.json(toSnakeCase(invoice));
});
