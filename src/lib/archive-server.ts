import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";

/**
 * Archiving a document.
 *
 * Archiving is a filing gesture, not a deletion and not a state change: the
 * document keeps its number, its status and its amounts, and keeps counting in
 * the VAT return and the accounting export. It only stops crowding the working
 * list. That is why `archivedAt` is a separate column rather than another value
 * of `status` — a settled invoice that is put away is still a settled invoice,
 * and a tax authority does not care about the tidiness of a list.
 *
 * It is reversible, so nothing here needs to be guarded on a state: a stale
 * draft is as worth putting away as a paid invoice.
 */
type ArchivableModel = "invoice" | "quote";

export async function setArchived(
  model: ArchivableModel,
  tenantId: string,
  id: string | undefined,
  archived: boolean
) {
  if (!id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Idempotent: archiving twice is the same as archiving once, so an offline
  // replay or a double click can't produce an error the user has to think about.
  const archivedAt = archived ? new Date() : null;

  // The two delegates are structurally identical here but Prisma types them as
  // distinct unions, so the branch is spelled out rather than selected into a
  // variable.
  const updated =
    model === "invoice"
      ? await (async () => {
          const existing = await prisma.invoice.findFirst({
            where: { tenantId, id },
            select: { id: true },
          });
          if (!existing) return null;
          return prisma.invoice.update({ where: { id: existing.id }, data: { archivedAt } });
        })()
      : await (async () => {
          const existing = await prisma.quote.findFirst({
            where: { tenantId, id },
            select: { id: true },
          });
          if (!existing) return null;
          return prisma.quote.update({ where: { id: existing.id }, data: { archivedAt } });
        })();

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(toSnakeCase(updated));
}
