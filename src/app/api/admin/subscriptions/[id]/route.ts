import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";
import { withPlatformAdmin, withSuperAdmin, logAuditEvent, getClientIp } from "@/lib/admin-api-utils";

const ALLOWED_STATUSES = ["pending", "active", "expired", "suspended", "cancelled"];
const ALLOWED_CYCLES = ["monthly", "yearly"];

export const GET = withPlatformAdmin(async (_req: NextRequest, ctx) => {
  const id = ctx.params?.id;
  if (!id) {
    return NextResponse.json({ error: "Missing subscription ID" }, { status: 400 });
  }

  const subscription = await prisma.subscription.findUnique({
    where: { id },
    include: {
      plan: true,
      tenant: true,
      invoices: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!subscription) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }

  return NextResponse.json(toSnakeCase(subscription));
});

// Edit a subscription: change plan, billing cycle, status, or period end.
export const PUT = withSuperAdmin(async (req: NextRequest, ctx) => {
  const id = ctx.params?.id;
  if (!id) {
    return NextResponse.json({ error: "Missing subscription ID" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    plan_id?: string;
    billing_cycle?: string;
    status?: string;
    current_period_end?: string;
  };

  if (body.status && !ALLOWED_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  if (body.billing_cycle && !ALLOWED_CYCLES.includes(body.billing_cycle)) {
    return NextResponse.json({ error: "Invalid billing cycle" }, { status: 400 });
  }

  const existing = await prisma.subscription.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }

  if (body.plan_id) {
    const plan = await prisma.plan.findUnique({ where: { id: body.plan_id } });
    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 400 });
    }
  }

  const now = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const updatedSubscription = await tx.subscription.update({
      where: { id },
      data: {
        planId: body.plan_id ?? existing.planId,
        billingCycle: body.billing_cycle ?? existing.billingCycle,
        status: body.status ?? existing.status,
        ...(body.status === "cancelled" ? { cancelledAt: now } : {}),
        currentPeriodEnd: body.current_period_end
          ? new Date(body.current_period_end)
          : existing.currentPeriodEnd,
      },
      include: { plan: true, tenant: true },
    });

    // Keep the tenant status in sync with the subscription status, mirroring
    // the dedicated cancel (suspend tenant) and activate routes.
    if (body.status === "cancelled" || body.status === "expired") {
      await tx.tenant.update({
        where: { id: existing.tenantId },
        data: { status: "suspended" },
      });
    } else if (body.status === "active") {
      await tx.tenant.update({
        where: { id: existing.tenantId },
        data: { status: "active" },
      });
    }

    return updatedSubscription;
  });

  await logAuditEvent({
    actorType: "platform_admin",
    actorId: ctx.adminId,
    action: "subscription.update",
    targetType: "subscription",
    targetId: id,
    tenantId: existing.tenantId,
    metadata: { changes: body },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(toSnakeCase(updated));
});
