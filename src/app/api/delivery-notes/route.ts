import { NextResponse } from "next/server";
import { withAuth, toSnakeCase, parseListPagination, nextCursorOf } from "@/lib/api-utils";
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

  // Opt-in cursor pagination (audit SALE-23): lean rows — scalars + client
  // name, no line arrays.
  const page = parseListPagination(req);
  if (page) {
    const cursorId = page.cursor
      ? (await prisma.deliveryNote.findFirst({
          where: { tenantId, id: page.cursor },
          select: { id: true },
        }))?.id ?? null
      : null;
    const data = await prisma.deliveryNote.findMany({
      where: { tenantId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: page.limit,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      include: { client: { select: { id: true, name: true } } },
    });
    return NextResponse.json(
      toSnakeCase({ data, nextCursor: nextCursorOf(data, page.limit) })
    );
  }

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

  // Stale offline caches can submit a deleted/foreign client id; catch it here
  // instead of letting the FK violation surface as a 500.
  const client = await prisma.client.findFirst({
    where: { tenantId, id: body.client_id },
    select: { id: true },
  });
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

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
