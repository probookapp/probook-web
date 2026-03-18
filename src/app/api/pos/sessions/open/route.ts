import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { posSessionOpenSchema } from "@/lib/validations";

export const POST = withAuth(async (req, { tenantId, session: authSession }) => {
  const body = await validateBody(req, posSessionOpenSchema);
  if (isValidationError(body)) return body;

  // Check for existing open session on this register
  const existing = await prisma.posSession.findFirst({
    where: { tenantId, registerId: body.register_id, status: "OPEN" },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Register already has an open session" },
      { status: 409 }
    );
  }

  const posSession = await prisma.posSession.create({
    data: {
      tenantId,
      registerId: body.register_id,
      userId: authSession.userId,
      openingFloat: body.opening_float ?? 0,
      status: "OPEN",
      notes: body.notes || null,
    },
  });
  return NextResponse.json(toSnakeCase(posSession));
});
