import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";
import {
  withSuperAdmin,
  logAuditEvent,
  getClientIp,
} from "@/lib/admin-api-utils";

export const POST = withSuperAdmin(async (req, ctx) => {
  const id = ctx.params?.id;

  const existing = await prisma.tenant.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const tenant = await prisma.tenant.update({
    where: { id },
    data: { status: "suspended" },
  });

  // Cancel all active subscriptions
  await prisma.subscription.updateMany({
    where: { tenantId: id, status: "active" },
    data: { status: "cancelled", cancelledAt: new Date() },
  });

  await logAuditEvent({
    actorType: "platform_admin",
    actorId: ctx.adminId,
    action: "tenant.suspend",
    targetType: "tenant",
    targetId: id,
    tenantId: id,
    metadata: { previousStatus: existing.status },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(toSnakeCase(tenant));
});
