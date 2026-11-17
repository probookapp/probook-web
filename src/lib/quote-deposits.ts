import type { Prisma } from "@/generated/prisma/client";

/**
 * Deposits taken on a quote, carried onto the invoice the quote became.
 *
 * A deposit is a Payment row with quoteId and no invoiceId. When the invoice
 * exists the same row gets its invoiceId — moved, never copied — so:
 *  - the invoice's balance counts it like any other payment;
 *  - the secured journal entry written when the money was received stays the
 *    only one (copying would have journaled the same cash twice);
 *  - the cash journal keeps it on the day it was actually received.
 *
 * Called by every path that turns a quote into an invoice: the quote's own
 * conversion, a delivery note made from the quote, and an invoice created with
 * quote_id. Returns the payments now on the invoice, for the response.
 */
export async function attachQuoteDeposits(
  tx: Prisma.TransactionClient,
  tenantId: string,
  quoteId: string | null | undefined,
  invoiceId: string
) {
  if (quoteId) {
    await tx.payment.updateMany({
      where: { tenantId, quoteId, invoiceId: null },
      data: { invoiceId },
    });
  }
  return tx.payment.findMany({
    where: { tenantId, invoiceId },
    orderBy: { paymentDate: "asc" },
  });
}
