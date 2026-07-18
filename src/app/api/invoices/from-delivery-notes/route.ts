import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/permissions-server";
import { validateBody, isValidationError } from "@/lib/validate";
import { invoiceFromDeliveryNotesSchema } from "@/lib/validations";
import { allocateDocumentNumber } from "@/lib/document-numbering";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Business-rule failure inside the create transaction → mapped to an HTTP error. */
class ConvertError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export const POST = withAuth(async (req, { session, tenantId }) => {
  const denied = await requirePermission(session, "invoices", "create");
  if (denied) return denied;

  const raw = await validateBody(req, invoiceFromDeliveryNotesSchema);
  if (isValidationError(raw)) return raw;
  const deliveryNoteIds = [...new Set(raw.delivery_note_ids)];

  const deliveryNotes = await prisma.deliveryNote.findMany({
    where: { tenantId, id: { in: deliveryNoteIds } },
    include: { lines: { orderBy: { position: "asc" } } },
  });

  if (deliveryNotes.length !== deliveryNoteIds.length) {
    return NextResponse.json({ error: "One or more delivery notes were not found" }, { status: 404 });
  }

  // A delivery note can only ever be billed once (audit SALE-4).
  if (deliveryNotes.some((dn) => dn.invoiceId)) {
    return NextResponse.json(
      { error: "One or more delivery notes are already invoiced" },
      { status: 409 }
    );
  }

  // All delivery notes must belong to the same client
  const clientIds = [...new Set(deliveryNotes.map((dn) => dn.clientId))];
  if (clientIds.length > 1) {
    return NextResponse.json({ error: "All delivery notes must belong to the same client" }, { status: 400 });
  }

  const settings = await prisma.companySettings.findFirst({ where: { tenantId } });
  const prefix = settings?.invoicePrefix ?? "INV-";
  const paymentTerms = settings?.defaultPaymentTerms ?? 30;
  const defaultTaxRate = settings?.defaultTaxRate ?? 20;

  // One tenant-scoped batch lookup instead of a per-line findFirst (SALE-24).
  // A referenced product that no longer exists is an error — silently pricing
  // the line at 0 would understate the invoice.
  const productIds = [
    ...new Set(
      deliveryNotes.flatMap((dn) => dn.lines.map((l) => l.productId)).filter((id): id is string => !!id)
    ),
  ];
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { tenantId, id: { in: productIds } },
        select: { id: true, unitPrice: true, taxRate: true },
      })
    : [];
  const productById = new Map(products.map((p) => [p.id, p]));
  if (productIds.some((id) => !productById.has(id))) {
    return NextResponse.json(
      { error: "One or more products on the delivery notes no longer exist" },
      { status: 400 }
    );
  }

  // Gather all lines from delivery notes; use product pricing if available
  let position = 0;
  const invoiceLines: {
    productId: string | null;
    description: string;
    descriptionHtml: string | null;
    quantity: number;
    unitPrice: number;
    taxRate: number;
    subtotal: number;
    taxAmount: number;
    total: number;
    position: number;
    groupName: string | null;
    isSubtotalLine: boolean;
  }[] = [];
  for (const dn of deliveryNotes) {
    for (const line of dn.lines) {
      const product = line.productId ? productById.get(line.productId) : undefined;
      const unitPrice = product?.unitPrice ?? 0;
      const taxRate = product?.taxRate ?? defaultTaxRate;
      const subtotal = round2(line.quantity * unitPrice);
      const taxAmount = round2(subtotal * (taxRate / 100));
      const total = round2(subtotal + taxAmount);
      invoiceLines.push({
        productId: line.productId,
        description: line.description,
        descriptionHtml: line.descriptionHtml,
        quantity: line.quantity,
        unitPrice,
        taxRate,
        subtotal,
        taxAmount,
        total,
        position: position++,
        groupName: null,
        isSubtotalLine: false,
      });
    }
  }

  const subtotal = round2(invoiceLines.reduce((s, l) => s + l.subtotal, 0));
  const taxAmount = round2(invoiceLines.reduce((s, l) => s + l.taxAmount, 0));
  const total = round2(subtotal + taxAmount);

  // Numbering, invoice create and delivery-note re-pointing happen in ONE
  // transaction (audit SALE-1/SALE-4); retried on a unique violation.
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
              clientId: clientIds[0],
              status: "DRAFT",
              issueDate: new Date(),
              dueDate: new Date(Date.now() + paymentTerms * 24 * 60 * 60 * 1000),
              subtotal,
              taxAmount,
              total,
              lines: {
                create: invoiceLines,
              },
            },
            include: { lines: { orderBy: { position: "asc" } }, client: true, payments: true },
          });

          // Link delivery notes to the new invoice. The invoiceId: null filter
          // makes a concurrent conversion of the same notes lose the race
          // instead of double-billing them.
          const linked = await tx.deliveryNote.updateMany({
            where: { tenantId, id: { in: deliveryNoteIds }, invoiceId: null },
            data: { invoiceId: created.id },
          });
          if (linked.count !== deliveryNoteIds.length) {
            throw new ConvertError("One or more delivery notes are already invoiced", 409);
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
