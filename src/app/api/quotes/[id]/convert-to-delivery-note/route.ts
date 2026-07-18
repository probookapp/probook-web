import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/permissions-server";
import { allocateDocumentNumber } from "@/lib/document-numbering";

/** Business-rule failure inside the create transaction → mapped to an HTTP error. */
class ConvertError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export const POST = withAuth(async (req, { tenantId, params, session }) => {
  const denied = await requirePermission(session, "delivery_notes", "create");
  if (denied) return denied;
  const quote = await prisma.quote.findFirst({
    where: { tenantId, id: params?.id },
    include: { lines: { orderBy: { position: "asc" } } },
  });
  if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const settings = await prisma.companySettings.findFirst({ where: { tenantId } });
  const prefix = settings?.deliveryNotePrefix ?? "DN-";

  // Atomic number allocation + create (audit SALE-2); retried on a unique
  // violation (e.g. counter manually rewound in settings).
  const MAX_ATTEMPTS = 3;
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        const deliveryNote = await prisma.$transaction(async (tx) => {
          // A quote converts to at most one delivery note (audit SALE-15).
          // Checked inside the transaction so a concurrent double-click can't
          // slip two conversions through.
          const alreadyConverted = await tx.deliveryNote.findFirst({
            where: { tenantId, quoteId: quote.id },
            select: { id: true },
          });
          if (alreadyConverted) {
            throw new ConvertError("This quote has already been converted to a delivery note", 409);
          }

          const nextNum = await allocateDocumentNumber(tx, tenantId, "nextDeliveryNoteNumber");
          const deliveryNoteNumber = `${prefix}${String(nextNum).padStart(5, "0")}`;

          const created = await tx.deliveryNote.create({
            data: {
              tenantId,
              deliveryNoteNumber,
              clientId: quote.clientId,
              quoteId: quote.id,
              status: "DRAFT",
              issueDate: new Date(),
              notes: quote.notes,
              notesHtml: quote.notesHtml,
              lines: {
                create: quote.lines
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

          // A quote whose goods are being delivered is by definition accepted.
          await tx.quote.update({
            where: { tenantId, id: quote.id },
            data: { status: "ACCEPTED" },
          });

          return created;
        });

        return NextResponse.json(toSnakeCase(deliveryNote));
      } catch (err) {
        if (!isUniqueViolation(err) || attempt >= MAX_ATTEMPTS - 1) throw err;
      }
    }
  } catch (err) {
    if (err instanceof ConvertError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
});
