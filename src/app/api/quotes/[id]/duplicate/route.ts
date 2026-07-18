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
  const denied = await requirePermission(session, "quotes", "create");
  if (denied) return denied;
  const original = await prisma.quote.findFirst({
    where: { tenantId, id: params?.id },
    include: { lines: { orderBy: { position: "asc" } } },
  });
  if (!original) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const settings = await prisma.companySettings.findFirst({ where: { tenantId } });
  const prefix = settings?.quotePrefix ?? "QT-";

  // Atomic number allocation + create (audit SALE-1); retried on a unique
  // violation (e.g. counter manually rewound in settings).
  const MAX_ATTEMPTS = 3;
  for (let attempt = 0; ; attempt++) {
    try {
      const duplicate = await prisma.$transaction(async (tx) => {
        const nextNum = await allocateDocumentNumber(tx, tenantId, "nextQuoteNumber");
        const quoteNumber = `${prefix}${String(nextNum).padStart(5, "0")}`;

        return tx.quote.create({
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
      });

      return NextResponse.json(toSnakeCase(duplicate));
    } catch (err) {
      if (!isUniqueViolation(err) || attempt >= MAX_ATTEMPTS - 1) throw err;
    }
  }
});
