import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { validateBody, isValidationError } from "@/lib/validate";
import { createDeliveryNoteSchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";
import { allocateDocumentNumber } from "@/lib/document-numbering";

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

interface DeliveryLineInput {
  product_id?: string | null;
  description: string;
  description_html?: string | null;
  quantity: number;
  unit?: string;
  position?: number;
}

export const GET = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "delivery_notes", "view");
  if (denied) return denied;
  const notes = await prisma.deliveryNote.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: { lines: { orderBy: { position: "asc" } }, client: true },
  });
  return NextResponse.json(toSnakeCase(notes));
});

export const POST = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "delivery_notes", "create");
  if (denied) return denied;
  const body = await validateBody(req, createDeliveryNoteSchema);
  if (isValidationError(body)) return body;

  const settings = await prisma.companySettings.findFirst({ where: { tenantId } });
  const prefix = settings?.deliveryNotePrefix ?? "DN-";

  const lines = body.lines || [];

  // Atomic number allocation + create (audit SALE-2); retried on a unique
  // violation (e.g. counter manually rewound in settings).
  const MAX_ATTEMPTS = 3;
  for (let attempt = 0; ; attempt++) {
    try {
      const note = await prisma.$transaction(async (tx) => {
        const nextNum = await allocateDocumentNumber(tx, tenantId, "nextDeliveryNoteNumber");
        const deliveryNoteNumber = `${prefix}${String(nextNum).padStart(5, "0")}`;

        return tx.deliveryNote.create({
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
      });

      return NextResponse.json(toSnakeCase(note));
    } catch (err) {
      if (!isUniqueViolation(err) || attempt >= MAX_ATTEMPTS - 1) throw err;
    }
  }
});
