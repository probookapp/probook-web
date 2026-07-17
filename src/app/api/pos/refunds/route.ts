import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { posRefundSchema } from "@/lib/validations";
import { createCreditNote } from "@/lib/credit-notes";
import { requirePermission } from "@/lib/permissions-server";

// POS sales are often made to walk-in customers with no client record, but a
// credit note requires a client. We resolve/create a single per-tenant
// placeholder client for those refunds.
const POS_WALK_IN_CLIENT_NAME = "POS Walk-in customer";

async function resolveWalkInClientId(
  db: Parameters<typeof createCreditNote>[0],
  tenantId: string
): Promise<string> {
  const existing = await db.client.findFirst({
    where: { tenantId, name: POS_WALK_IN_CLIENT_NAME },
  });
  if (existing) return existing.id;
  const created = await db.client.create({
    data: { tenantId, name: POS_WALK_IN_CLIENT_NAME },
  });
  return created.id;
}

export const POST = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "pos", "delete");
  if (denied) return denied;
  const body = await validateBody(req, posRefundSchema);
  if (isValidationError(body)) return body;

  const transaction = await prisma.posTransaction.findFirst({
    where: { tenantId, id: body.transaction_id },
  });
  if (!transaction) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }

  // Restock returned items to the register's location (falls back to default).
  const register = transaction.registerId
    ? await prisma.posRegister.findFirst({
        where: { tenantId, id: transaction.registerId },
        select: { locationId: true },
      })
    : null;
  const refundLocationId = register?.locationId ?? null;

  const creditNote = await prisma.$transaction(async (tx) => {
    const clientId = transaction.clientId ?? (await resolveWalkInClientId(tx, tenantId));
    return createCreditNote(tx, {
      tenantId,
      userId: session.userId,
      clientId,
      invoiceId: transaction.invoiceId || null,
      issueDate: new Date(),
      reason: body.reason || `Refund for ticket ${transaction.ticketNumber}`,
      notes: body.notes || null,
      restock: !!body.restock,
      locationId: refundLocationId,
      lines: body.lines,
    });
  });

  return NextResponse.json(toSnakeCase(creditNote));
});
