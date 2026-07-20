import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { posSessionCloseSchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";
import { num } from "@/lib/money";

export const POST = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "pos", "create");
  if (denied) return denied;
  const body = await validateBody(req, posSessionCloseSchema);
  if (isValidationError(body)) return body;

  const posSession = await prisma.posSession.findFirst({
    where: { tenantId, id: body.session_id, status: "OPEN" },
  });
  if (!posSession) {
    return NextResponse.json({ error: "Session not found or already closed" }, { status: 404 });
  }

  // Calculate expected cash from transactions and movements
  const transactions = await prisma.posTransaction.findMany({
    where: { tenantId, sessionId: body.session_id, status: "COMPLETED" },
    include: { payments: true },
  });
  const cashMovements = await prisma.posCashMovement.findMany({
    where: { tenantId, sessionId: body.session_id },
  });

  let expectedCash = num(posSession.openingFloat);
  for (const tx of transactions) {
    for (const payment of tx.payments) {
      if (payment.paymentMethod === "CASH") {
        expectedCash += num(payment.amount);
      }
    }
  }
  for (const mv of cashMovements) {
    if (mv.movementType === "IN") expectedCash += num(mv.amount);
    else expectedCash -= num(mv.amount);
  }

  const actualCash = body.actual_cash ?? expectedCash;
  const cashDifference = actualCash - expectedCash;

  const updated = await prisma.posSession.update({
    where: { tenantId, id: body.session_id },
    data: {
      closedAt: new Date(),
      expectedCash,
      actualCash,
      cashDifference,
      status: "CLOSED",
      notes: body.notes || posSession.notes,
    },
  });
  return NextResponse.json(toSnakeCase(updated));
});
