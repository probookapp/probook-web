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
  const denied = await requirePermission(session, "invoices", "create");
  if (denied) return denied;
  const quote = await prisma.quote.findFirst({
    where: { tenantId, id: params?.id },
    include: { lines: { orderBy: { position: "asc" } } },
  });
  if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const settings = await prisma.companySettings.findFirst({ where: { tenantId } });
  const prefix = settings?.invoicePrefix ?? "INV-";
  const paymentTerms = settings?.defaultPaymentTerms ?? 30;

  // Atomic number allocation + create (audit SALE-1); retried on a unique
  // violation (e.g. counter manually rewound in settings).
  const MAX_ATTEMPTS = 3;
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        const invoice = await prisma.$transaction(async (tx) => {
          // A quote converts to at most one invoice (audit SALE-15). Checked
          // inside the transaction so a concurrent double-click can't slip two
          // conversions through.
          const alreadyConverted = await tx.invoice.findFirst({
            where: { tenantId, quoteId: quote.id },
            select: { id: true },
          });
          if (alreadyConverted) {
            throw new ConvertError("This quote has already been converted to an invoice", 409);
          }

          const nextNum = await allocateDocumentNumber(tx, tenantId, "nextInvoiceNumber");
          const invoiceNumber = `${prefix}${String(nextNum).padStart(5, "0")}`;

          const created = await tx.invoice.create({
            data: {
              tenantId,
              invoiceNumber,
              clientId: quote.clientId,
              quoteId: quote.id,
              status: "DRAFT",
              issueDate: new Date(),
              dueDate: new Date(Date.now() + paymentTerms * 24 * 60 * 60 * 1000),
              subtotal: quote.subtotal,
              taxAmount: quote.taxAmount,
              total: quote.total,
              notes: quote.notes,
              notesHtml: quote.notesHtml,
              shippingCost: quote.shippingCost,
              shippingTaxRate: quote.shippingTaxRate,
              downPaymentPercent: quote.downPaymentPercent,
              downPaymentAmount: quote.downPaymentAmount,
              lines: {
                create: quote.lines.map((line) => ({
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
            include: { lines: { orderBy: { position: "asc" } }, client: true, payments: true },
          });

          // A converted quote is by definition accepted by the client.
          await tx.quote.update({
            where: { tenantId, id: quote.id },
            data: { status: "ACCEPTED" },
          });

          return created;
        });

        return NextResponse.json(toSnakeCase(invoice));
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
