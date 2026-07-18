import { prisma } from "@/lib/db";

/**
 * Shared helpers for the reminders API routes.
 *
 * Reminders always point at a tenant document (invoice / quote / delivery
 * note). There is no dedicated "reminders" permission module, so mutations are
 * gated on the referenced document's module and reads on the dashboard module
 * (the reminders widget lives on the dashboard).
 */

/** Document types a reminder can reference, mapped to their permission module. */
export const REMINDER_DOCUMENT_MODULES: Record<string, string> = {
  invoice: "invoices",
  quote: "quotes",
  delivery_note: "delivery_notes",
};

/**
 * Reminder types the app actually creates: the server-side sweep uses
 * payment_overdue / quote_expiring, the typed client API declares
 * PAYMENT_DUE / QUOTE_EXPIRING / DELIVERY_SCHEDULED / CUSTOM (compared
 * lowercased here).
 */
export const REMINDER_TYPES = new Set([
  "payment_overdue",
  "payment_due",
  "quote_expiring",
  "delivery_scheduled",
  "custom",
]);

/** Permission module for a reminder's stored document type (case-insensitive). */
export function reminderDocumentModule(documentType: string): string | null {
  return REMINDER_DOCUMENT_MODULES[documentType.toLowerCase()] || null;
}

/** Tenant-scoped existence check for the document a reminder points to. */
export async function reminderDocumentExists(
  tenantId: string,
  documentType: string,
  documentId: string
): Promise<boolean> {
  switch (documentType) {
    case "invoice":
      return !!(await prisma.invoice.findFirst({
        where: { tenantId, id: documentId },
        select: { id: true },
      }));
    case "quote":
      return !!(await prisma.quote.findFirst({
        where: { tenantId, id: documentId },
        select: { id: true },
      }));
    case "delivery_note":
      return !!(await prisma.deliveryNote.findFirst({
        where: { tenantId, id: documentId },
        select: { id: true },
      }));
    default:
      return false;
  }
}
