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

  // The business owner is protected here too. The tenant's own API already
  // refuses to deactivate them (lib/tenant-owner.ts) — leaving this door open
  // would let a support action do exactly what that rule exists to prevent:
  // leave a business with nobody able to manage it. Re-enabling is possible, so
  // this is not irreversible, but the business is locked out until someone
  // notices, and the person who notices is the customer.
  //
  // Refusing costs nothing: to act against a whole business there is tenant
  // suspension, and to change who holds the keys there is ownership transfer.
  // Only on the way down: re-enabling the owner is always allowed.
  if (user.isActive) {
    const owner = await prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { ownerUserId: true },
    });
    if (owner?.ownerUserId === id) {
      return NextResponse.json(
        {
          error:
            "This account owns the business. Transfer ownership first, or suspend the tenant instead.",
          code: "OWNER_PROTECTED",
        },
        { status: 400 }
      );
    }
  }

  const updatedUser = await prisma.user.update({
    where: { id },
    data: { isActive: !user.isActive },
    include: {
      tenant: { select: { id: true, name: true } },
    },
  });

  // Disabling a user must log them out everywhere immediately
  if (!updatedUser.isActive) {
    await prisma.userSession.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

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
