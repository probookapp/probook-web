import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export const POST = withAuth(async (req, { tenantId, params }) => {
  const invoice = await prisma.invoice.findFirst({
    where: { tenantId, id: params?.id },
    include: { lines: { orderBy: { position: "asc" } } },
  });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const settings = await prisma.companySettings.findFirst({ where: { tenantId } });
  const nextNum = settings?.nextDeliveryNoteNumber ?? 1;
  const prefix = settings?.deliveryNotePrefix ?? "DN-";
  const deliveryNoteNumber = `${prefix}${String(nextNum).padStart(5, "0")}`;

  const deliveryNote = await prisma.deliveryNote.create({
    data: {
      tenantId,
      deliveryNoteNumber,
      clientId: invoice.clientId,
      invoiceId: invoice.id,
      status: "DRAFT",
      issueDate: new Date(),
      notes: invoice.notes,
      notesHtml: invoice.notesHtml,
      lines: {
        create: invoice.lines
          .filter((line) => !line.isSubtotalLine)
          .map((line, idx) => ({
            productId: line.productId,
            description: line.description,
            descriptionHtml: line.descriptionHtml,
            quantity: line.quantity,
            unit: "unit",
            position: idx,
          })),
      },
    },
    include: { lines: { orderBy: { position: "asc" } }, client: true },
  });

  if (settings) {
    await prisma.companySettings.update({
      where: { id: settings.id },
      data: { nextDeliveryNoteNumber: nextNum + 1 },
    });
  }

  return NextResponse.json(toSnakeCase(deliveryNote));
});
