import { Prisma } from "@/generated/prisma/client";

export type DocumentCounterField =
  | "nextInvoiceNumber"
  | "nextQuoteNumber"
  | "nextDeliveryNoteNumber"
  | "nextCreditNoteNumber";

/**
 * Atomically allocate the next document number for a tenant.
 *
 * Must be called INSIDE the same $transaction that creates the document so a
 * failed create rolls the counter back. The atomic `increment` makes two
 * concurrent creates receive distinct numbers (the DB serializes the row
 * update), unlike the old read-then-bump pattern which raced and produced
 * duplicate-key 500s (audit SALE-1/2/17, POS-10).
 */
export async function allocateDocumentNumber(
  tx: Prisma.TransactionClient,
  tenantId: string,
  field: DocumentCounterField
): Promise<number> {
  const updated = await tx.companySettings.upsert({
    where: { tenantId },
    update: { [field]: { increment: 1 } },
    create: { tenantId, [field]: 2 },
    select: { id: true, [field]: true },
  });
  const next = (updated as unknown as Record<DocumentCounterField, number | null>)[field];
  if (next === null || next === undefined) {
    // Legacy row where the nullable counter column was NULL: NULL + 1 stays
    // NULL in Postgres, so seed it explicitly and allocate 1.
    await tx.companySettings.update({
      where: { tenantId },
      data: { [field]: 2 },
    });
    return 1;
  }
  return next - 1;
}
