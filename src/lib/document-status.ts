/**
 * The states a sales document can be in, and how a list request asks for them.
 *
 * Filtering happens server-side. Doing it in the browser would only filter the
 * pages already loaded, so "show me the unpaid ones" would quietly mean "the
 * unpaid ones among the fifty most recent" — an answer that looks precise and
 * is not.
 */
export const QUOTE_STATUSES = ["DRAFT", "SENT", "ACCEPTED", "EXPIRED"] as const;
export const INVOICE_STATUSES = ["DRAFT", "ISSUED", "PAID"] as const;
export const DELIVERY_NOTE_STATUSES = ["DRAFT", "DELIVERED", "CANCELLED"] as const;

export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export type DeliveryNoteStatus = (typeof DELIVERY_NOTE_STATUSES)[number];

/** What a list page shows when no state is selected. */
export const ALL_STATUSES = "ALL";

/**
 * A pseudo-state for the chip row: "Archived" sits next to the real states in
 * the UI but is a different axis on the server (a separate column, so an
 * archived invoice keeps its own status).
 */
export const ARCHIVED_FILTER = "ARCHIVED";

/** Split a chip selection into the two query params the API expects. */
export function chipToQuery(value: string): { status?: string; archived?: string } {
  if (value === ARCHIVED_FILTER) return { archived: "true" };
  if (value === ALL_STATUSES) return {};
  return { status: value };
}

/**
 * Read a `status` query parameter into a Prisma filter.
 *
 * Accepts one state or a comma-separated set, and silently drops anything not
 * in `allowed`: an unknown state must narrow the list to nothing rather than
 * reach the database, and a stale bookmark must not 500.
 */
export function parseStatusFilter<T extends string>(
  raw: string | null | undefined,
  allowed: readonly T[]
): { status: { in: T[] } } | Record<string, never> {
  if (!raw) return {};
  const wanted = raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (wanted.length === 0 || wanted.includes(ALL_STATUSES)) return {};
  const valid = allowed.filter((s) => wanted.includes(s));
  // Every requested state was unknown: return a filter that matches nothing,
  // not an unfiltered list that looks like the filter was applied.
  return { status: { in: valid } };
}

/** Client-side equivalent for the demo lists, which never hit the API. */
export function filterByStatus<T extends { status: string }>(
  rows: T[],
  status?: string | null
): T[] {
  if (!status || status === ALL_STATUSES) return rows;
  const wanted = new Set(
    status.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
  );
  return rows.filter((row) => wanted.has(row.status.toUpperCase()));
}

/**
 * Whether a list includes archived documents.
 *
 * Archiving only tidies the working list, so the default is to hide what has
 * been put away. Reports deliberately ignore this: an archived invoice is still
 * declared. See src/lib/archive-server.ts.
 */
export function parseArchivedFilter(
  raw: string | null | undefined
): { archivedAt: null } | { archivedAt: { not: null } } | Record<string, never> {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "true" || value === "only") return { archivedAt: { not: null } };
  if (value === "all") return {};
  return { archivedAt: null };
}
