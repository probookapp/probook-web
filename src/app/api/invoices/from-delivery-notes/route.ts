import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { invoiceFromDeliveryNotesSchema } from "@/lib/validations";

export const POST = withAuth(async (req, { tenantId }) => {
  const raw = await validateBody(req, invoiceFromDeliveryNotesSchema);
  if (isValidationError(raw)) return raw;
  const deliveryNoteIds = raw.delivery_note_ids;

  const deliveryNotes = await prisma.deliveryNote.findMany({
    where: { tenantId, id: { in: deliveryNoteIds } },
    include: { lines: { orderBy: { position: "asc" } } },
  });

  if (!deliveryNotes.length) {
    return NextResponse.json({ error: "No delivery notes found" }, { status: 404 });
  }

  // All delivery notes must belong to the same client
  const clientIds = [...new Set(deliveryNotes.map((dn) => dn.clientId))];
  if (clientIds.length > 1) {
    return NextResponse.json({ error: "All delivery notes must belong to the same client" }, { status: 400 });
  }

  const settings = await prisma.companySettings.findFirst({ where: { tenantId } });
  const nextNum = settings?.nextInvoiceNumber ?? 1;
  const prefix = settings?.invoicePrefix ?? "INV-";
  const invoiceNumber = `${prefix}${String(nextNum).padStart(5, "0")}`;
  const paymentTerms = settings?.defaultPaymentTerms ?? 30;
  const defaultTaxRate = settings?.defaultTaxRate ?? 20;

  // Gather all lines from delivery notes; use product pricing if available
  let position = 0;
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
  for (const dn of deliveryNotes) {
    for (const line of dn.lines) {
      let unitPrice = 0;
      let taxRate = defaultTaxRate;
      if (line.productId) {
        const product = await prisma.product.findFirst({ where: { tenantId, id: line.productId } });
        if (product) {
          unitPrice = product.unitPrice;
          taxRate = product.taxRate;
        }
      }
      const subtotal = line.quantity * unitPrice;
      const taxAmount = subtotal * (taxRate / 100);
      const total = subtotal + taxAmount;
      invoiceLines.push({
        productId: line.productId,
        description: line.description,
        descriptionHtml: line.descriptionHtml,
        quantity: line.quantity,
        unitPrice,
        taxRate,
        subtotal,
        taxAmount,
        total,
        position: position++,
        groupName: null,
        isSubtotalLine: false,
      });
    }
  }

  const subtotal = invoiceLines.reduce((s, l) => s + l.subtotal, 0);
  const taxAmount = invoiceLines.reduce((s, l) => s + l.taxAmount, 0);
  const total = subtotal + taxAmount;

  const invoice = await prisma.invoice.create({
    data: {
      tenantId,
      invoiceNumber,
      clientId: clientIds[0],
      status: "DRAFT",
      issueDate: new Date(),
      dueDate: new Date(Date.now() + paymentTerms * 24 * 60 * 60 * 1000),
      subtotal,
      taxAmount,
      total,
      lines: {
        create: invoiceLines,
      },
    },
    include: { lines: { orderBy: { position: "asc" } }, client: true, payments: true },
  });

  // Link delivery notes to the new invoice
  await prisma.deliveryNote.updateMany({
    where: { tenantId, id: { in: deliveryNoteIds } },
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
