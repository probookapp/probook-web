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
    include: { plan: true },
  });

  if (!subscription) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }

  const now = new Date();
  const periodEnd = new Date(now);
  if (subscription.billingCycle === "monthly") {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  } else {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  }

  // Count existing invoices for sequential numbering
  const invoiceCount = await prisma.subscriptionInvoice.count();

  const updated = await prisma.$transaction(async (tx) => {
    const updatedSubscription = await tx.subscription.update({
      where: { id },
      data: {
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        status: "active",
      },
      include: { plan: true, tenant: true },
    });

    await tx.subscriptionInvoice.create({
      data: {
        subscriptionId: id,
        invoiceNumber: `PLAT-INV-${invoiceCount + 1}`,
        tenantId: subscription.tenantId,
        amount: subscription.priceAtPurchase,
        currency: subscription.currency,
        status: "unpaid",
        periodStart: now,
        periodEnd: periodEnd,
      },
    });

    return updatedSubscription;
  });

  await logAuditEvent({
    actorType: "platform_admin",
    actorId: ctx.adminId,
    action: "subscription.renew",
    targetType: "subscription",
    targetId: id,
    tenantId: subscription.tenantId,
    metadata: { planName: subscription.plan.name, billingCycle: subscription.billingCycle },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(toSnakeCase(updated));
});
