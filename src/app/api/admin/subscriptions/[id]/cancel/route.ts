import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";
import { withSuperAdmin, logAuditEvent, getClientIp } from "@/lib/admin-api-utils";

export const POST = withSuperAdmin(async (req: NextRequest, ctx) => {
  const id = ctx.params?.id;
  if (!id) {
    return NextResponse.json({ error: "Missing subscription ID" }, { status: 400 });
  }

  const subscription = await prisma.subscription.findUnique({
    where: { id },
  });

  if (!subscription) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }

  const now = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const updatedSubscription = await tx.subscription.update({
      where: { id },
      data: {
        status: "cancelled",
        cancelledAt: now,
      },
      include: { plan: true, tenant: true },
    });

    await tx.tenant.update({
      where: { id: subscription.tenantId },
      data: { status: "suspended" },
    });

    return updatedSubscription;
  });

  await logAuditEvent({
    actorType: "platform_admin",
    actorId: ctx.adminId,
    action: "subscription.cancel",
    targetType: "subscription",
    targetId: id,
    tenantId: subscription.tenantId,
    metadata: { cancelledAt: now.toISOString() },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(toSnakeCase(updated));
});
