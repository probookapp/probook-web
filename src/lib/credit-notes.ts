import { Prisma } from "@/generated/prisma/client";
import { prisma } from "./db";
import { applyStockChange } from "./stock";

/**
 * Shared credit-note creation logic used by both the credit-notes API and the
 * POS refund flow.
 *
 * Handles: separate credit-note numbering (mirrors invoice numbering), total
 * computation from lines, line creation, optional restock via the shared stock
 * ledger, and bumping `nextCreditNoteNumber` on the settings row.
 *
 * Pass a transaction client (`prisma.$transaction(tx => ...)`) so numbering,
 * creation, restock and the counter bump all commit atomically.
 */

type Db = Prisma.TransactionClient | typeof prisma;

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
 */
export async function createCreditNote(db: Db, input: CreateCreditNoteInput) {
  const settings = await db.companySettings.findFirst({ where: { tenantId: input.tenantId } });
  const nextNum = settings?.nextCreditNoteNumber ?? 1;
  const prefix = settings?.creditNotePrefix ?? "CN-";
  const creditNoteNumber = `${prefix}${String(nextNum).padStart(5, "0")}`;

  const lines = input.lines || [];
  const totals = computeTotals(lines);

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
      if (!line.product_id) continue;
      await applyStockChange(db, {
        tenantId: input.tenantId,
        productId: line.product_id,
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

  if (settings) {
    await db.companySettings.update({
      where: { id: settings.id },
      data: { nextCreditNoteNumber: nextNum + 1 },
    });
  }

  return creditNote;
}
