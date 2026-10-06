import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "./db";
import { withAuth, toSnakeCase } from "./api-utils";
import { requirePermission } from "./permissions-server";
import { validateBody, isValidationError } from "./validate";
import { TAGS_INCLUDE, flattenTags, type TaggableDocument } from "./document-tags";

/**
 * Narrow a list of requested tag ids to the ones this tenant actually owns.
 *
 * A stale offline cache, a copied link or a crafted request can all name a tag
 * that was deleted or belongs to another business. Dropping them quietly is
 * right here: a label that cannot be found is not worth failing a document over,
 * and the response says which labels were attached.
 */
export async function ownTagIds(tenantId: string, requested: string[]): Promise<string[]> {
  const unique = [...new Set(requested)].filter(Boolean);
  if (unique.length === 0) return [];
  const rows = await prisma.tag.findMany({
    where: { tenantId, id: { in: unique } },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

const tagIdsSchema = z.object({ tag_ids: z.array(z.string()) });

/**
 * The permission each document type's labels sit behind.
 *
 * Whoever may edit an invoice may say what it is called. The entitlement gate is
 * separate and still applies by path prefix — a business without the
 * delivery-notes module cannot label one.
 */
const EDIT_PERMISSION: Record<TaggableDocument, string> = {
  quotes: "quotes",
  invoices: "invoices",
  "delivery-notes": "delivery_notes",
};

/**
 * Does this document belong to this tenant?
 *
 * Switched rather than looked up in a map of delegates: Prisma's generated
 * signatures are per-model, and a union of three of them is not callable. Three
 * short branches that each typecheck beat one that needs an `any`.
 */
async function findOwnDocument(
  document: TaggableDocument,
  tenantId: string,
  id: string | undefined
): Promise<{ id: string } | null> {
  const where = { tenantId, id };
  const select = { id: true };
  switch (document) {
    case "quotes":
      return prisma.quote.findFirst({ where, select });
    case "invoices":
      return prisma.invoice.findFirst({ where, select });
    case "delivery-notes":
      return prisma.deliveryNote.findFirst({ where, select });
  }
}

/** Replace the join rows and read the labels back, flattened. */
async function replaceTags(
  document: TaggableDocument,
  id: string,
  tagIds: string[]
): Promise<{ id: string; name: string; color: string }[]> {
  // Replace rather than merge: the picker sends the whole set it is showing, so
  // a label the user just unticked has to disappear.
  const data = { tags: { deleteMany: {}, create: tagIds.map((tagId) => ({ tagId })) } };
  const where = { id };
  switch (document) {
    case "quotes":
      return flattenTags(await prisma.quote.update({ where, data, include: TAGS_INCLUDE })).tags;
    case "invoices":
      return flattenTags(await prisma.invoice.update({ where, data, include: TAGS_INCLUDE })).tags;
    case "delivery-notes":
      return flattenTags(
        await prisma.deliveryNote.update({ where, data, include: TAGS_INCLUDE })
      ).tags;
  }
}

/**
 * `PUT /api/<document>/[id]/tags` — replace a document's labels.
 *
 * A route of its own rather than a field on the document update, for a reason
 * that only shows up on the second document type: an issued invoice is
 * immutable. Its update route deliberately ignores everything but a draft,
 * because issuing snapshots the integrity hash, the stamp-duty figure and the
 * stock movement. Labels are none of those things — the whole point of the axis
 * is that they carry nothing — and an invoice you cannot file is an invoice you
 * cannot find. So labels change here, at any status, and the document itself
 * never moves.
 *
 * Creation still accepts `tag_ids` inline, so a document can be born labelled.
 */
export function documentTagsRoute(document: TaggableDocument) {
  return withAuth(async (req, { tenantId, params, session }) => {
    const denied = await requirePermission(session, EDIT_PERMISSION[document], "edit");
    if (denied) return denied;

    const body = await validateBody(req, tagIdsSchema);
    if (isValidationError(body)) return body;

    // Tenant-scoped existence check before any write: an id from another
    // business must be a 404, never a silent cross-tenant update.
    const existing = await findOwnDocument(document, tenantId, params?.id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const tagIds = await ownTagIds(tenantId, body.tag_ids);
    const tags = await replaceTags(document, existing.id, tagIds);

    return NextResponse.json(toSnakeCase({ tags }));
  });
}
