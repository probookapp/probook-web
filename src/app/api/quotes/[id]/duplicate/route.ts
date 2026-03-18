import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export const POST = withAuth(async (req, { tenantId, params }) => {
  const original = await prisma.quote.findFirst({
    where: { tenantId, id: params?.id },
    include: { lines: { orderBy: { position: "asc" } } },
  });
  if (!original) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const settings = await prisma.companySettings.findFirst({ where: { tenantId } });
  const nextNum = settings?.nextQuoteNumber ?? 1;
  const prefix = settings?.quotePrefix ?? "QT-";
  const quoteNumber = `${prefix}${String(nextNum).padStart(5, "0")}`;

  const duplicate = await prisma.quote.create({
    data: {
      tenantId,
      quoteNumber,
      clientId: original.clientId,
      status: "DRAFT",
      issueDate: new Date(),
      validityDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      subtotal: original.subtotal,
      taxAmount: original.taxAmount,
      total: original.total,
      notes: original.notes,
      notesHtml: original.notesHtml,
      shippingCost: original.shippingCost,
      shippingTaxRate: original.shippingTaxRate,
      downPaymentPercent: original.downPaymentPercent,
      downPaymentAmount: original.downPaymentAmount,
      lines: {
        create: original.lines.map((line) => ({
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
    include: { lines: { orderBy: { position: "asc" } }, client: true },
  });

  if (settings) {
    await prisma.companySettings.update({
      where: { id: settings.id },
      data: { nextQuoteNumber: nextNum + 1 },
    });
  }

  return NextResponse.json(toSnakeCase(duplicate));
});
