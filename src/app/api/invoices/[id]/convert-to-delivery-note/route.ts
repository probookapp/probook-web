import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/permissions-server";
import { allocateDocumentNumber } from "@/lib/document-numbering";

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export const POST = withAuth(async (req, { session, tenantId, params }) => {
  const denied = await requirePermission(session, "invoices", "edit");
  if (denied) return denied;

  const invoice = await prisma.invoice.findFirst({
    where: { tenantId, id: params?.id },
    include: { lines: { orderBy: { position: "asc" } } },
  });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const settings = await prisma.companySettings.findFirst({ where: { tenantId } });
  const prefix = settings?.deliveryNotePrefix ?? "DN-";

  // Atomic number allocation + create (audit SALE-2); retried on a unique
  // violation (e.g. counter manually rewound in settings).
  const MAX_ATTEMPTS = 3;
  for (let attempt = 0; ; attempt++) {
    try {
      const deliveryNote = await prisma.$transaction(async (tx) => {
        const nextNum = await allocateDocumentNumber(tx, tenantId, "nextDeliveryNoteNumber");
        const deliveryNoteNumber = `${prefix}${String(nextNum).padStart(5, "0")}`;

        return tx.deliveryNote.create({
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
      });

      return NextResponse.json(toSnakeCase(deliveryNote));
    } catch (err) {
      if (!isUniqueViolation(err) || attempt >= MAX_ATTEMPTS - 1) throw err;
    }
  }
});
