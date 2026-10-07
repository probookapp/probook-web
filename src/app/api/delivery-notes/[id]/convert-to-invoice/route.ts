import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/permissions-server";
import { allocateDocumentNumber } from "@/lib/document-numbering";
import { calculateDocumentTotals } from "@/lib/document-totals";
import { documentLineRows } from "@/lib/bundles";
import { priceDeliveryNoteLines } from "@/lib/bundles-server";

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
  const note = await prisma.deliveryNote.findFirst({
    where: { tenantId, id: params?.id },
    include: { lines: { orderBy: { position: "asc" } } },
  });
  if (!note) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // A delivery note can only ever be billed once (audit SALE-4).
  if (note.invoiceId) {
    return NextResponse.json({ error: "This delivery note is already invoiced" }, { status: 409 });
  }

  const settings = await prisma.companySettings.findFirst({ where: { tenantId } });
  const prefix = settings?.invoicePrefix ?? "INV-";
  const paymentTerms = settings?.defaultPaymentTerms ?? 30;
  const defaultTaxRate = settings?.defaultTaxRate ?? 20;

  // Prices come from the catalogue, packs split between their components; see
  // src/lib/bundles-server.ts.
  const priced = await priceDeliveryNoteLines(tenantId, [note], {
    defaultTaxRate,
    currency: settings?.currency,
  });
  if (priced instanceof NextResponse) return priced;
  const { subtotal, taxAmount, total } = calculateDocumentTotals({
    lines: priced,
    currency: settings?.currency,
  });
  const invoiceLines = documentLineRows(priced, settings?.currency);

  // Numbering, invoice create and delivery-note re-pointing happen in ONE
  // transaction (audit SALE-2/SALE-4); retried on a unique violation.
  const MAX_ATTEMPTS = 3;
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        const invoice = await prisma.$transaction(async (tx) => {
          const nextNum = await allocateDocumentNumber(tx, tenantId, "nextInvoiceNumber");
          const invoiceNumber = `${prefix}${String(nextNum).padStart(5, "0")}`;

          const created = await tx.invoice.create({
            data: {
              tenantId,
              invoiceNumber,
              clientId: note.clientId,
              status: "DRAFT",
              issueDate: new Date(),
              dueDate: new Date(Date.now() + paymentTerms * 24 * 60 * 60 * 1000),
              subtotal,
              taxAmount,
              total,
              lines: { create: invoiceLines },
            },
            include: { lines: { orderBy: { position: "asc" } }, client: true, payments: true },
          });

          // Link delivery note to invoice. The invoiceId: null filter makes a
          // concurrent conversion of the same note lose the race instead of
          // double-billing it.
          const linked = await tx.deliveryNote.updateMany({
            where: { tenantId, id: note.id, invoiceId: null },
            data: { invoiceId: created.id },
          });
          if (linked.count !== 1) {
            throw new ConvertError("This delivery note is already invoiced", 409);
          }

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
