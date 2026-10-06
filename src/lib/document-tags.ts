/**
 * Reading and filtering the labels on a sales document.
 *
 * Tags live on their own axis: attaching or removing one never touches a figure,
 * a date, a number or a status, so none of this belongs in the totals or the
 * numbering. That is also why the same three functions serve quotes, invoices
 * and delivery notes without caring which is which.
 *
 * Kept free of any database import so the browser can use the same filter over
 * the demo lists — see document-tags-server.ts for the write side.
 */

/** What every document read includes, so the shape never differs by route. */
export const TAGS_INCLUDE = {
  tags: { include: { tag: true }, orderBy: { tag: { name: "asc" as const } } },
} as const;

interface TagRow {
  id: string;
  name: string;
  color: string;
}

/**
 * Flatten the join rows into the labels themselves.
 *
 * The client has no use for `{ invoice_id, tag_id, tag: {…} }`; it wants the
 * words. Done on the way out rather than in the component so the offline cache,
 * the CSV export and the lists all see one shape.
 */
export function flattenTags<T extends { tags: { tag: TagRow }[] }>(
  document: T
): Omit<T, "tags"> & { tags: TagRow[] } {
  return { ...document, tags: document.tags.map((row) => row.tag) };
}

/** Read a `tag` query parameter into a Prisma filter on a document list. */
export function parseTagFilter(
  raw: string | null | undefined
): { tags: { some: { tagId: string } } } | Record<string, never> {
  const value = (raw ?? "").trim();
  if (!value) return {};
  // One label at a time: the chip row is single-select, and an unknown id
  // narrows the list to nothing rather than silently showing everything.
  return { tags: { some: { tagId: value } } };
}

/** Client-side equivalent for the demo lists, which never hit the API. */
export function filterByTag<T extends { tags?: { id: string }[] }>(
  rows: T[],
  tagId?: string | null
): T[] {
  if (!tagId) return rows;
  return rows.filter((row) => (row.tags ?? []).some((tag) => tag.id === tagId));
}

/** The document types that carry labels, as the tags endpoint names them. */
export const TAGGABLE_DOCUMENTS = ["quotes", "invoices", "delivery-notes"] as const;

export type TaggableDocument = (typeof TAGGABLE_DOCUMENTS)[number];
