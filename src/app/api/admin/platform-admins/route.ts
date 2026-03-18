import { NextRequest, NextResponse } from "next/server";
import { withPlatformAdmin, withSuperAdmin, logAuditEvent, getClientIp } from "@/lib/admin-api-utils";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";
import bcrypt from "bcryptjs";
import { validateBody, isValidationError } from "@/lib/validate";
import { createPlatformAdminSchema } from "@/lib/validations";

export const GET = withPlatformAdmin(async (_req: NextRequest, _ctx) => {
  const admins = await prisma.platformAdmin.findMany({
    orderBy: { createdAt: "desc" },
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

  return NextResponse.json(toSnakeCase(admins));
});

export const POST = withSuperAdmin(async (req: NextRequest, ctx) => {
  const body = await validateBody(req, createPlatformAdminSchema);
  if (isValidationError(body)) return body;
  const { username, display_name, email, password, role } = body;

  const validRoles = ["super_admin", "support_agent"];
  const adminRole = validRoles.includes(role) ? role : "support_agent";

  const existing = await prisma.platformAdmin.findFirst({
    where: { OR: [{ username }, { email }] },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Username or email already exists" },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.platformAdmin.create({
    data: {
      username,
      displayName: display_name || username,
      email,
      passwordHash,
      role: adminRole,
    },
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
    action: "platform_admin.create",
    targetType: "platform_admin",
    targetId: admin.id,
    metadata: { username: admin.username, role: admin.role },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(toSnakeCase(admin), { status: 201 });
});
