import { NextRequest, NextResponse } from "next/server";
import { withSuperAdmin, logAuditEvent, getClientIp } from "@/lib/admin-api-utils";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";

export const PUT = withSuperAdmin(async (req: NextRequest, ctx) => {
  const id = ctx.params?.id;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const updatedUser = await prisma.user.update({
    where: { id },
    data: { isActive: !user.isActive },
    include: {
      tenant: { select: { id: true, name: true } },
    },
  });

  await logAuditEvent({
    actorType: "platform_admin",
    actorId: ctx.adminId,
    action: updatedUser.isActive ? "user.enable" : "user.disable",
    targetType: "user",
    targetId: id,
    tenantId: user.tenantId,
    metadata: { username: user.username, newState: updatedUser.isActive },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(toSnakeCase(updatedUser));
});

// Also support POST for the adapter mapping
export const POST = PUT;
