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
