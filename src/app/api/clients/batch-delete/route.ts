import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { batchDeleteSchema } from "@/lib/validations";

export const POST = withAuth(async (req, { tenantId }) => {
  const ids = await validateBody(req, batchDeleteSchema);
  if (isValidationError(ids)) return ids;

  // Exclude clients referenced by quotes, invoices, or delivery notes
  const [quotedClients, invoicedClients, deliveryClients] = await Promise.all([
    prisma.quote.findMany({ where: { tenantId, clientId: { in: ids } }, select: { clientId: true }, distinct: ["clientId"] }),
    prisma.invoice.findMany({ where: { tenantId, clientId: { in: ids } }, select: { clientId: true }, distinct: ["clientId"] }),
    prisma.deliveryNote.findMany({ where: { tenantId, clientId: { in: ids } }, select: { clientId: true }, distinct: ["clientId"] }),
  ]);
  const blockedIds = new Set([
    ...quotedClients.map((c) => c.clientId),
    ...invoicedClients.map((c) => c.clientId),
    ...deliveryClients.map((c) => c.clientId),
  ]);
  const deletableIds = ids.filter((id: string) => !blockedIds.has(id));

  if (deletableIds.length === 0 && blockedIds.size > 0) {
    return NextResponse.json(
      { error: "Cannot delete clients with existing documents" },
      { status: 409 }
    );
  }

  const result = await prisma.client.deleteMany({ where: { tenantId, id: { in: deletableIds } } });
  return NextResponse.json({ deleted: result.count, skipped: blockedIds.size });
});
