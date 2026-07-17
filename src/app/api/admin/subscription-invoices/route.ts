import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";
import { withPlatformAdmin, withSuperAdmin, logAuditEvent, getClientIp } from "@/lib/admin-api-utils";

function generateSubInvoiceNumber(): string {
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `SINV-${Date.now().toString(36).toUpperCase()}-${rand}`;
}

export const GET = withPlatformAdmin(async (req) => {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const where = status ? { status } : {};

  const invoices = await prisma.subscriptionInvoice.findMany({
    where,
    include: {
      subscription: {
        include: {
          plan: { select: { id: true, name: true, slug: true } },
          tenant: { select: { id: true, name: true, slug: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(toSnakeCase(invoices));
});

// Create a subscription invoice for a subscription.
export const POST = withSuperAdmin(async (req: NextRequest, ctx) => {
  const body = (await req.json().catch(() => ({}))) as {
    subscription_id?: string;
    amount?: number; // centimes
    currency?: string;
    status?: string;
    period_start?: string;
    period_end?: string;
  };

  if (!body.subscription_id || body.amount == null) {
    return NextResponse.json({ error: "Missing subscription_id or amount" }, { status: 400 });
  }

  const subscription = await prisma.subscription.findUnique({ where: { id: body.subscription_id } });
  if (!subscription) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }

  const status = body.status === "paid" ? "paid" : "unpaid";
  const created = await prisma.subscriptionInvoice.create({
    data: {
      subscriptionId: subscription.id,
      tenantId: subscription.tenantId,
      invoiceNumber: generateSubInvoiceNumber(),
      amount: Math.round(body.amount),
      currency: body.currency || subscription.currency || "DZD",
      status,
      paidAt: status === "paid" ? new Date() : null,
      periodStart: body.period_start ? new Date(body.period_start) : subscription.currentPeriodStart,
      periodEnd: body.period_end ? new Date(body.period_end) : subscription.currentPeriodEnd,
    },
    include: {
      subscription: { include: { plan: true, tenant: { select: { id: true, name: true, slug: true } } } },
    },
  });

  await logAuditEvent({
    actorType: "platform_admin",
    actorId: ctx.adminId,
    action: "subscription_invoice.create",
    targetType: "subscription_invoice",
    targetId: created.id,
    tenantId: subscription.tenantId,
    metadata: { amount: created.amount, status },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(toSnakeCase(created), { status: 201 });
});
