import { documentTagsRoute } from "@/lib/document-tags-server";

/**
 * Replace the labels on a invoice.
 *
 * One shared handler for the three document types — see
 * src/lib/document-tags-server.ts for why labels are changed here rather
 * than through the document update.
 */
export const PUT = documentTagsRoute("invoices");
