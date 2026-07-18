import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/permissions-server";
import { allocateDocumentNumber } from "@/lib/document-numbering";

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export const POST = withAuth(async (req, { tenantId, params, session }) => {
  const denied = await requirePermission(session, "delivery_notes", "create");
  if (denied) return denied;
  const original = await prisma.deliveryNote.findFirst({
    where: { tenantId, id: params?.id },
    include: { lines: { orderBy: { position: "asc" } } },
  });
  if (!original) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const settings = await prisma.companySettings.findFirst({ where: { tenantId } });
  const prefix = settings?.deliveryNotePrefix ?? "DN-";

  // Atomic number allocation + create (audit SALE-2); retried on a unique
  // violation (e.g. counter manually rewound in settings).
  const MAX_ATTEMPTS = 3;
  for (let attempt = 0; ; attempt++) {
    try {
      const duplicate = await prisma.$transaction(async (tx) => {
        const nextNum = await allocateDocumentNumber(tx, tenantId, "nextDeliveryNoteNumber");
        const deliveryNoteNumber = `${prefix}${String(nextNum).padStart(5, "0")}`;

        return tx.deliveryNote.create({
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
      });

      return NextResponse.json(toSnakeCase(duplicate));
    } catch (err) {
      if (!isUniqueViolation(err) || attempt >= MAX_ATTEMPTS - 1) throw err;
    }
  }
});
