import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/permissions-server";
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

  // One tenant-scoped batch lookup instead of a per-line findFirst (SALE-24).
  // A referenced product that no longer exists is an error — silently pricing
  // the line at 0 would understate the invoice.
  const productIds = [...new Set(note.lines.map((l) => l.productId).filter((id): id is string => !!id))];
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { tenantId, id: { in: productIds } },
        select: { id: true, unitPrice: true, taxRate: true },
      })
    : [];
  const productById = new Map(products.map((p) => [p.id, p]));
  if (productIds.some((id) => !productById.has(id))) {
    return NextResponse.json(
      { error: "One or more products on the delivery note no longer exist" },
      { status: 400 }
    );
  }

  // Build invoice lines from delivery note lines with product pricing
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
  let subtotal = 0;
  let taxAmount = 0;

  for (const line of note.lines) {
    const product = line.productId ? productById.get(line.productId) : undefined;
    const unitPrice = product?.unitPrice ?? 0;
    const taxRate = product?.taxRate ?? defaultTaxRate;
    const lineHt = round2(line.quantity * unitPrice);
    const lineVat = round2(lineHt * (taxRate / 100));
    subtotal += lineHt;
    taxAmount += lineVat;

    invoiceLines.push({
      productId: line.productId,
      description: line.description,
      descriptionHtml: line.descriptionHtml,
      quantity: line.quantity,
      unitPrice,
      taxRate,
      subtotal: lineHt,
      taxAmount: lineVat,
      total: round2(lineHt + lineVat),
      position: line.position,
      groupName: null,
      isSubtotalLine: false,
    });
  }

  subtotal = round2(subtotal);
  taxAmount = round2(taxAmount);
  const total = round2(subtotal + taxAmount);

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
