import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { updatePosRegisterSchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";

export const GET = withAuth(async (req, { tenantId, params }) => {
  const register = await prisma.posRegister.findFirst({ where: { tenantId, id: params?.id } });
  if (!register) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(toSnakeCase(register));
});

export const PUT = withAuth(async (req, { tenantId, params, session }) => {
  const denied = await requirePermission(session, "pos", "edit");
  if (denied) return denied;
  const body = await validateBody(req, updatePosRegisterSchema);
  if (isValidationError(body)) return body;
  // The stock location a register deducts from must belong to this tenant.
  if (body.location_id) {
    const location = await prisma.location.findFirst({
      where: { tenantId, id: body.location_id },
      select: { id: true },
    });
    if (!location) {
      return NextResponse.json({ error: "Location not found" }, { status: 400 });
    }
  }
  const register = await prisma.posRegister.update({
    where: { tenantId, id: params?.id },
    data: {
      name: body.name,
      location: body.location || null,
      locationId: body.location_id || null,
      isActive: body.is_active,
    },
  });
  return NextResponse.json(toSnakeCase(register));
});

export const DELETE = withAuth(async (req, { tenantId, params, session }) => {
  const denied = await requirePermission(session, "pos", "delete");
  if (denied) return denied;
  await prisma.posRegister.delete({ where: { tenantId, id: params?.id } });
  return new NextResponse(null, { status: 204 });
});
