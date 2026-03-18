import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { updateDeliveryNoteSchema } from "@/lib/validations";

interface DeliveryLineInput {
  product_id?: string | null;
  description: string;
  description_html?: string | null;
  quantity: number;
  unit?: string;
  position?: number;
}

export const GET = withAuth(async (req, { tenantId, params }) => {
  const note = await prisma.deliveryNote.findFirst({
    where: { tenantId, id: params?.id },
    include: { lines: { orderBy: { position: "asc" } }, client: true },
  });
  if (!note) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(toSnakeCase(note));
});

export const PUT = withAuth(async (req, { tenantId, params }) => {
  const body = await validateBody(req, updateDeliveryNoteSchema);
  if (isValidationError(body)) return body;
  const lines = body.lines || [];

  await prisma.deliveryNoteLine.deleteMany({ where: { deliveryNoteId: params?.id } });

  const note = await prisma.deliveryNote.update({
    where: { tenantId, id: params?.id },
    data: {
      clientId: body.client_id,
      status: body.status,
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

  return NextResponse.json(toSnakeCase(note));
});

export const DELETE = withAuth(async (req, { tenantId, params }) => {
  await prisma.deliveryNote.delete({ where: { tenantId, id: params?.id } });
  return new NextResponse(null, { status: 204 });
});
