import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export const POST = withAuth(async (req, { tenantId, params }) => {
  const original = await prisma.deliveryNote.findFirst({
    where: { tenantId, id: params?.id },
    include: { lines: { orderBy: { position: "asc" } } },
  });
  if (!original) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const settings = await prisma.companySettings.findFirst({ where: { tenantId } });
  const nextNum = settings?.nextDeliveryNoteNumber ?? 1;
  const prefix = settings?.deliveryNotePrefix ?? "DN-";
  const deliveryNoteNumber = `${prefix}${String(nextNum).padStart(5, "0")}`;

  const duplicate = await prisma.deliveryNote.create({
    data: {
      tenantId,
      deliveryNoteNumber,
      clientId: original.clientId,
      status: "DRAFT",
      issueDate: new Date(),
      deliveryAddress: original.deliveryAddress,
      notes: original.notes,
      notesHtml: original.notesHtml,
      lines: {
        create: original.lines.map((line) => ({
          productId: line.productId,
          description: line.description,
          descriptionHtml: line.descriptionHtml,
          quantity: line.quantity,
          unit: line.unit,
          position: line.position,
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

  return NextResponse.json(toSnakeCase(duplicate));
});
