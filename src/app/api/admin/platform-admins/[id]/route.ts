import { NextRequest, NextResponse } from "next/server";
import { withSuperAdmin, logAuditEvent, getClientIp } from "@/lib/admin-api-utils";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";
import bcrypt from "bcryptjs";
import { validateBody, isValidationError } from "@/lib/validate";
import { updatePlatformAdminSchema } from "@/lib/validations";

export const PUT = withSuperAdmin(async (req: NextRequest, ctx) => {
  const id = ctx.params?.id;
  if (!id) {
    return NextResponse.json({ error: "ID required" }, { status: 400 });
  }

  const body = await validateBody(req, updatePlatformAdminSchema);
  if (isValidationError(body)) return body;
  const data: Record<string, unknown> = {};

  if (body.username !== undefined) data.username = body.username;
  if (body.display_name !== undefined) data.displayName = body.display_name;
  if (body.email !== undefined) data.email = body.email;
  if (body.role !== undefined) {
    const validRoles = ["super_admin", "support_agent"];
    if (validRoles.includes(body.role)) data.role = body.role;
  }
  if (typeof body.is_active === "boolean") data.isActive = body.is_active;
  if (body.password && body.password.length >= 6) {
    data.passwordHash = await bcrypt.hash(body.password, 12);
  }

  const admin = await prisma.platformAdmin.update({
    where: { id },
    data,
    select: {
      id: true,
      username: true,
      displayName: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  await logAuditEvent({
    actorType: "platform_admin",
    actorId: ctx.adminId,
    action: "platform_admin.update",
    targetType: "platform_admin",
    targetId: id,
    metadata: { fields: Object.keys(data) },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(toSnakeCase(admin));
});

export const DELETE = withSuperAdmin(async (req: NextRequest, ctx) => {
  const id = ctx.params?.id;
  if (!id) {
    return NextResponse.json({ error: "ID required" }, { status: 400 });
  }

  // Prevent self-deletion
  if (id === ctx.adminId) {
    return NextResponse.json(
      { error: "Cannot delete your own account" },
      { status: 400 }
    );
  }

  const admin = await prisma.platformAdmin.findUnique({ where: { id } });
  if (!admin) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.platformAdmin.delete({ where: { id } });

  await logAuditEvent({
    actorType: "platform_admin",
    actorId: ctx.adminId,
    action: "platform_admin.delete",
    targetType: "platform_admin",
    targetId: id,
    metadata: { username: admin.username },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json({ success: true });
});
