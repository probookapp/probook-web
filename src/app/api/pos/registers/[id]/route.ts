import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { updatePosRegisterSchema } from "@/lib/validations";

export const GET = withAuth(async (req, { tenantId, params }) => {
  const register = await prisma.posRegister.findFirst({ where: { tenantId, id: params?.id } });
  if (!register) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(toSnakeCase(register));
});

export const PUT = withAuth(async (req, { tenantId, params }) => {
  const body = await validateBody(req, updatePosRegisterSchema);
  if (isValidationError(body)) return body;
  const register = await prisma.posRegister.update({
    where: { tenantId, id: params?.id },
    data: {
      name: body.name,
      location: body.location || null,
      isActive: body.is_active,
    },
  });
  return NextResponse.json(toSnakeCase(register));
});

export const DELETE = withAuth(async (req, { tenantId, params }) => {
  await prisma.posRegister.delete({ where: { tenantId, id: params?.id } });
  return new NextResponse(null, { status: 204 });
});
