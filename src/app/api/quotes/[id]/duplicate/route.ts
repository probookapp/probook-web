import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/permissions-server";
import { allocateDocumentNumber } from "@/lib/document-numbering";
import { flattenTags, TAGS_INCLUDE } from "@/lib/document-tags";

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export const POST = withAuth(async (req, { tenantId, params, session }) => {
  const denied = await requirePermission(session, "quotes", "create");
  if (denied) return denied;
  const original = await prisma.quote.findFirst({
    where: { tenantId, id: params?.id },
    include: { lines: { orderBy: { position: "asc" } }, ...TAGS_INCLUDE },
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
            // The commercial discount was left behind here, which copied the
            // original's discounted subtotal and total onto a quote that
            // claimed no discount — a document that no longer reconstructed
            // from its own lines (see src/lib/document-totals.ts).
            discountPercent: original.discountPercent,
            discountAmount: original.discountAmount,
            // Labels follow the copy: a duplicate of the Hydra quote is still
            // the Hydra site.
            tags: { create: original.tags.map((row) => ({ tagId: row.tagId })) },
            lines: {
              create: original.lines.map((line) => ({
                productId: line.productId,
                variantId: line.variantId,
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
                // Dropped too: a line's own discount is part of how its
                // subtotal was reached.
                discountPercent: line.discountPercent,
                isSubtotalLine: line.isSubtotalLine,
              })),
            },
          },
          include: { lines: { orderBy: { position: "asc" } }, client: true, ...TAGS_INCLUDE },
        });
      });

      return NextResponse.json(toSnakeCase(flattenTags(duplicate)));
    } catch (err) {
      if (!isUniqueViolation(err) || attempt >= MAX_ATTEMPTS - 1) throw err;
    }
  }
});
