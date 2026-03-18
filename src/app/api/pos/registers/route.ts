import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { posRegisterSchema } from "@/lib/validations";

export const GET = withAuth(async (req, { tenantId }) => {
  const registers = await prisma.posRegister.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(toSnakeCase(registers));
});

export const POST = withAuth(async (req, { tenantId }) => {
  const body = await validateBody(req, posRegisterSchema);
  if (isValidationError(body)) return body;
  const register = await prisma.posRegister.create({
    data: {
      tenantId,
      name: body.name,
      location: body.location || null,
      isActive: body.is_active ?? true,
    },
  });
  return NextResponse.json(toSnakeCase(register));
});
