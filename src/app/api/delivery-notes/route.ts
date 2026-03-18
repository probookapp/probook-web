import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { createDeliveryNoteSchema } from "@/lib/validations";

interface DeliveryLineInput {
  product_id?: string | null;
  description: string;
  description_html?: string | null;
  quantity: number;
  unit?: string;
  position?: number;
}

export const GET = withAuth(async (req, { tenantId }) => {
  const notes = await prisma.deliveryNote.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: { lines: { orderBy: { position: "asc" } }, client: true },
  });
  return NextResponse.json(toSnakeCase(notes));
});

export const POST = withAuth(async (req, { tenantId }) => {
  const body = await validateBody(req, createDeliveryNoteSchema);
  if (isValidationError(body)) return body;

  const settings = await prisma.companySettings.findFirst({ where: { tenantId } });
  const nextNum = settings?.nextDeliveryNoteNumber ?? 1;
  const prefix = settings?.deliveryNotePrefix ?? "DN-";
  const deliveryNoteNumber = `${prefix}${String(nextNum).padStart(5, "0")}`;

  const lines = body.lines || [];

  const note = await prisma.deliveryNote.create({
    data: {
      tenantId,
      deliveryNoteNumber,
      clientId: body.client_id,
      quoteId: body.quote_id || null,
      invoiceId: body.invoice_id || null,
      status: body.status || "DRAFT",
      issueDate: new Date(body.issue_date),
      deliveryDate: body.delivery_date ? new Date(body.delivery_date) : null,
      deliveryAddress: body.delivery_address || null,
      notes: body.notes || null,
      notesHtml: body.notes_html || null,
      lines: {
        create: lines.map((line: DeliveryLineInput, idx: number) => ({
          productId: line.product_id || null,
          description: line.description,
          descriptionHtml: line.description_html || null,
          quantity: line.quantity,
          unit: line.unit || "unit",
          position: line.position ?? idx,
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

  return NextResponse.json(toSnakeCase(note));
});
