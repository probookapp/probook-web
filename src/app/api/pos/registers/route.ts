import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { posRegisterSchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";

export const GET = withAuth(async (req, { tenantId }) => {
  const registers = await prisma.posRegister.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(toSnakeCase(registers));
});

export const POST = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "pos", "create");
  if (denied) return denied;
  const body = await validateBody(req, posRegisterSchema);
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
  const register = await prisma.posRegister.create({
    data: {
      tenantId,
      name: body.name,
      location: body.location || null,
      locationId: body.location_id || null,
      isActive: body.is_active ?? true,
    },
  });
  return NextResponse.json(toSnakeCase(register));
});
