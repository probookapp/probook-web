import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { posCashMovementSchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";

export const POST = withAuth(async (req, { tenantId, session: authSession }) => {
  const denied = await requirePermission(authSession, "pos", "create");
  if (denied) return denied;
  const body = await validateBody(req, posCashMovementSchema);
  if (isValidationError(body)) return body;

  // The movement must land in this tenant's session, and only while it's OPEN —
  // a closed session's counted drawer must never change after the fact.
  const posSession = await prisma.posSession.findFirst({
    where: { tenantId, id: body.session_id },
    select: { status: true },
  });
  if (!posSession) {
    return NextResponse.json({ error: "Session not found" }, { status: 400 });
  }
  if (posSession.status !== "OPEN") {
    return NextResponse.json(
      { error: "Cannot record a cash movement on a closed session" },
      { status: 409 }
    );
  }

  const movement = await prisma.posCashMovement.create({
    data: {
      tenantId,
      sessionId: body.session_id,
      userId: authSession.userId,
      movementType: body.movement_type,
      amount: body.amount,
      reason: body.reason,
      reference: body.reference || null,
    },
  });
  return NextResponse.json(toSnakeCase(movement));
});
