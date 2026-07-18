// Invoice integrity hashing (audit SALE-5).
//
// v2 hashes are HMAC-SHA256 keyed with a server-side secret, so a party who can
// read (or tamper with) the database rows cannot recompute a matching hash the
// way they could with the old unkeyed sha256. v2 also covers the fields the
// legacy scheme omitted (dueDate, shippingCost, stampDuty, isCashSale,
// stampDutyExempt and each line's total).
//
// Legacy hashes (no "v2:" prefix) remain verifiable via the original unkeyed
// sha256 computation so invoices issued before this change still validate.

import { createHash, createHmac } from "node:crypto";

const V2_PREFIX = "v2:";

export interface InvoiceIntegrityLine {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  subtotal: number;
  total: number;
}

export interface InvoiceIntegrityInput {
  invoiceNumber: string;
  clientId: string;
  issueDate: Date;
  dueDate: Date;
  subtotal: number;
  taxAmount: number;
  total: number;
  shippingCost: number;
  stampDuty: number;
  isCashSale: boolean;
  stampDutyExempt: boolean;
  lines: InvoiceIntegrityLine[];
}

function integritySecret(): string {
  const secret = process.env.INVOICE_INTEGRITY_SECRET ?? process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("INVOICE_INTEGRITY_SECRET (or JWT_SECRET) must be set to hash invoices");
  }
  return secret;
}

/** Current (v2) keyed integrity hash. Stored prefixed with "v2:". */
export function computeInvoiceIntegrityHash(invoice: InvoiceIntegrityInput): string {
  const payload = [
    invoice.invoiceNumber,
    invoice.clientId,
    invoice.issueDate.toISOString(),
    invoice.dueDate.toISOString(),
    invoice.subtotal.toString(),
    invoice.taxAmount.toString(),
    invoice.total.toString(),
    invoice.shippingCost.toString(),
    invoice.stampDuty.toString(),
    String(invoice.isCashSale),
    String(invoice.stampDutyExempt),
    ...invoice.lines.map(
      (l) => `${l.description}|${l.quantity}|${l.unitPrice}|${l.taxRate}|${l.total}`
    ),
  ].join("|");

  return V2_PREFIX + createHmac("sha256", integritySecret()).update(payload).digest("hex");
}

/** Legacy unkeyed sha256 over the original (narrower) field set. Verification only. */
export function computeLegacyInvoiceIntegrityHash(invoice: InvoiceIntegrityInput): string {
  const hashInput = [
    invoice.invoiceNumber,
    invoice.clientId,
    invoice.issueDate.toISOString(),
    invoice.subtotal.toString(),
    invoice.taxAmount.toString(),
    invoice.total.toString(),
    ...invoice.lines.map(
      (l) => `${l.description}|${l.quantity}|${l.unitPrice}|${l.taxRate}|${l.subtotal}`
    ),
  ].join("|");

  return createHash("sha256").update(hashInput).digest("hex");
}

/**
 * Verify a stored hash against the invoice's current fields, dispatching on the
 * scheme: "v2:"-prefixed hashes use the keyed HMAC, bare hashes fall back to
 * the legacy sha256 so pre-migration invoices keep verifying.
 */
export function verifyInvoiceIntegrityHash(
  storedHash: string,
  invoice: InvoiceIntegrityInput
): { valid: boolean; computedHash: string } {
  const computedHash = storedHash.startsWith(V2_PREFIX)
    ? computeInvoiceIntegrityHash(invoice)
    : computeLegacyInvoiceIntegrityHash(invoice);
  return { valid: computedHash === storedHash, computedHash };
}
