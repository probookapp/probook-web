/**
 * The invoice a quote was converted to (at most one, see convert-to-invoice).
 * The quote stays ACCEPTED after conversion, so this is the only way the UI
 * can tell an already-converted quote apart and stop offering to convert it.
 */
export const CONVERTED_INVOICE_INCLUDE = {
  invoices: { select: { id: true, invoiceNumber: true }, take: 1 },
} as const;
