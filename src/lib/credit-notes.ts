import { Prisma } from "@/generated/prisma/client";
import { prisma } from "./db";
import { applyStockChange } from "./stock";
import { allocateDocumentNumber } from "./document-numbering";

/**
 * Shared credit-note creation logic used by both the credit-notes API and the
 * POS refund flow.
 *
 * Handles: separate credit-note numbering (atomic counter, mirrors invoice
 * numbering), total computation from lines, line creation, optional restock via
 * the shared stock ledger, plus tenant validation of the client/invoice and an
 * over-credit cap for invoice-linked notes.
 *
 * Pass a transaction client (`prisma.$transaction(tx => ...)`) so numbering,
 * creation, restock and the counter bump all commit atomically.
 */

type Db = Prisma.TransactionClient | typeof prisma;

/** Business-rule failure — callers map it to an HTTP response. */
export class CreditNoteError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export interface CreditNoteLineInput {
  product_id?: string | null;
  variant_id?: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate?: number;
}

export interface CreateCreditNoteInput {
  tenantId: string;
  userId?: string | null;
  clientId: string;
  invoiceId?: string | null;
  /** Set for POS refunds — links the credit note back to the originating sale. */
  posTransactionId?: string | null;
  issueDate: string | Date;
  reason?: string | null;
  notes?: string | null;
  restock: boolean;
  /** Location returned items are restocked to. Defaults to the tenant's default location. */
  locationId?: string | null;
  lines: CreditNoteLineInput[];
}

function computeTotals(lines: CreditNoteLineInput[]) {
  let subtotal = 0;
  let taxAmount = 0;
  for (const line of lines) {
    const lineSubtotal = line.quantity * line.unit_price;
    subtotal += lineSubtotal;
    taxAmount += lineSubtotal * ((line.tax_rate ?? 0) / 100);
  }
  return { subtotal, taxAmount, total: subtotal + taxAmount };
}

/**
 * Create a credit note (with lines) inside the given db/transaction client.
 * Restocks returned product lines when `restock` is true.
 *
 * Throws {@link CreditNoteError} when the client/invoice doesn't belong to the
 * tenant (404) or the note would over-credit its linked invoice (409).
 */
export async function createCreditNote(db: Db, input: CreateCreditNoteInput) {
  // The client (and invoice, when linked) must belong to the tenant.
  const client = await db.client.findFirst({
    where: { tenantId: input.tenantId, id: input.clientId },
    select: { id: true },
  });
  if (!client) throw new CreditNoteError("Client not found", 404);

  const lines = input.lines || [];
  const totals = computeTotals(lines);

  if (input.invoiceId) {
    const invoice = await db.invoice.findFirst({
      where: { tenantId: input.tenantId, id: input.invoiceId },
      select: { id: true, total: true, stampDuty: true },
    });
    if (!invoice) throw new CreditNoteError("Invoice not found", 404);

    // Cap the total credited against this invoice at what the client actually
    // owed (total + stamp duty), minus prior credit notes for the same invoice.
    const prior = await db.creditNote.aggregate({
      where: { tenantId: input.tenantId, invoiceId: invoice.id },
      _sum: { total: true },
    });
    const alreadyCredited = prior._sum.total ?? 0;
    const creditable = invoice.total + (invoice.stampDuty ?? 0) - alreadyCredited;
    if (totals.total > creditable + 1e-6) {
      throw new CreditNoteError(
        "Credit note exceeds the remaining creditable amount for this invoice",
        409
      );
    }
  }

  const settings = await db.companySettings.findFirst({ where: { tenantId: input.tenantId } });
  const prefix = settings?.creditNotePrefix ?? "CN-";
  // Atomic counter allocation — two concurrent creates get distinct numbers.
  const nextNum = await allocateDocumentNumber(db, input.tenantId, "nextCreditNoteNumber");
  const creditNoteNumber = `${prefix}${String(nextNum).padStart(5, "0")}`;

  const creditNote = await db.creditNote.create({
    data: {
      tenantId: input.tenantId,
      creditNoteNumber,
      invoiceId: input.invoiceId || null,
      posTransactionId: input.posTransactionId || null,
      clientId: input.clientId,
      status: "ISSUED",
      issueDate: new Date(input.issueDate),
      reason: input.reason || null,
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      total: totals.total,
      restocked: !!input.restock,
      notes: input.notes || null,
      lines: {
        create: lines.map((line) => {
          const lineSubtotal = line.quantity * line.unit_price;
          const lineTax = lineSubtotal * ((line.tax_rate ?? 0) / 100);
          return {
            productId: line.product_id || null,
            variantId: line.variant_id || null,
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unit_price,
            taxRate: line.tax_rate ?? 0,
            subtotal: lineSubtotal,
            taxAmount: lineTax,
            total: lineSubtotal + lineTax,
          };
        }),
      },
    },
    include: { lines: true, client: true, invoice: true },
  });

  if (input.restock) {
    for (const line of lines) {
      // A variant-only line still restocks: resolve its parent product.
      let productId = line.product_id || null;
      if (!productId && line.variant_id) {
        const variant = await db.productVariant.findFirst({
          where: { tenantId: input.tenantId, id: line.variant_id },
          select: { productId: true },
        });
        productId = variant?.productId ?? null;
      }
      if (!productId) continue;
      await applyStockChange(db, {
        tenantId: input.tenantId,
        productId,
        variantId: line.variant_id || null,
        locationId: input.locationId ?? null,
        type: "return",
        quantityChange: Math.abs(line.quantity),
        reason: "Credit note restock",
        referenceType: "credit_note",
        referenceId: creditNote.id,
        userId: input.userId ?? null,
      });
    }
  }

  return creditNote;
}
