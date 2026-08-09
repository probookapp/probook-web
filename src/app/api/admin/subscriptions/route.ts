import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toSnakeCase, parseListPagination, nextCursorOf } from "@/lib/api-utils";
import {
  withPlatformAdmin,
  withSuperAdmin,
  logAuditEvent,
  getClientIp,
} from "@/lib/admin-api-utils";
import { validateBody, isValidationError } from "@/lib/validate";
import { createSubscriptionSchema } from "@/lib/validations";

// Collision-free subscription-invoice numbering (same scheme as the manual
// create route in /api/admin/subscription-invoices).
function generateSubInvoiceNumber(): string {
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `SINV-${Date.now().toString(36).toUpperCase()}-${rand}`;
}

export const GET = withPlatformAdmin(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const where = status ? { status } : undefined;

  // Opt-in cursor pagination (audit ADM-13): scalars + the one-row plan and
  // tenant relations (both cheap), same status filter, keyset order.
  const page = parseListPagination(req);
  if (page) {
    const cursorId = page.cursor
      ? (await prisma.subscription.findUnique({
          where: { id: page.cursor },
          select: { id: true },
        }))?.id ?? null
      : null;
    const data = await prisma.subscription.findMany({
      where,
      include: {
        plan: true,
        tenant: { select: { id: true, name: true, slug: true, status: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: page.limit,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    });
    return NextResponse.json(
      toSnakeCase({ data, nextCursor: nextCursorOf(data, page.limit) })
    );
  }

  const subscriptions = await prisma.subscription.findMany({
    where,
    include: {
      plan: true,
      tenant: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(toSnakeCase(subscriptions));
});

// Grant a subscription directly, without a tenant-submitted request (manual or
// offline sale). Mirrors the request-approval path: supersede any active row,
// activate the tenant, clear the signup trial, and raise an unpaid invoice.
export const POST = withSuperAdmin(async (req: NextRequest, ctx) => {
  const body = await validateBody(req, createSubscriptionSchema);
  if (isValidationError(body)) return body;

  const tenant = await prisma.tenant.findUnique({
    where: { id: body.tenant_id },
    select: { id: true },
  });
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 400 });
  }

  const plan = await prisma.plan.findUnique({
    where: { id: body.plan_id },
    include: { prices: true },
  });
  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 400 });
  }

  // Resolve the price for the requested currency, falling back to the plan's
  // own currency/prices when there is no per-currency row.
  const priceRow = body.currency
    ? plan.prices.find((p) => p.currency === body.currency)
    : undefined;
  const resolvedCurrency = priceRow?.currency ?? (body.currency || plan.currency);
  const listPrice =
    body.billing_cycle === "monthly"
      ? priceRow?.monthlyPrice ?? plan.monthlyPrice
      : priceRow?.yearlyPrice ?? plan.yearlyPrice;
  const price = body.price ?? listPrice;

  const now = new Date();
  let periodEnd: Date;
  if (body.current_period_end) {
    periodEnd = new Date(body.current_period_end);
    if (Number.isNaN(periodEnd.getTime())) {
      return NextResponse.json({ error: "Invalid period end" }, { status: 400 });
    }
    if (periodEnd <= now) {
      return NextResponse.json(
        { error: "Period end must be in the future" },
        { status: 400 }
      );
    }
  } else {
    periodEnd = new Date(now);
    if (body.billing_cycle === "monthly") {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    } else {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    // Never leave two active rows for one tenant — /subscription/current would
    // then pick one arbitrarily.
    const superseded = await tx.subscription.updateMany({
      where: { tenantId: body.tenant_id, status: "active" },
      data: { status: "cancelled", cancelledAt: now },
    });

    const subscription = await tx.subscription.create({
      data: {
        tenantId: body.tenant_id,
        planId: plan.id,
        status: "active",
        billingCycle: body.billing_cycle,
        priceAtPurchase: price,
        currency: resolvedCurrency,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        approvedAt: now,
        approvedBy: ctx.adminId,
      },
      include: { plan: true, tenant: true },
    });

    // Activate the tenant and drop any signup trial, so a lapsed trialEndsAt
    // can't hijack the wall messaging once this subscription ends.
    await tx.tenant.update({
      where: { id: body.tenant_id },
      data: { status: "active", trialEndsAt: null },
    });

    if (body.create_invoice) {
      await tx.subscriptionInvoice.create({
        data: {
          subscriptionId: subscription.id,
          invoiceNumber: generateSubInvoiceNumber(),
          tenantId: body.tenant_id,
          amount: price,
          currency: resolvedCurrency,
          status: "unpaid",
          periodStart: now,
          periodEnd: periodEnd,
        },
      });
    }

    return { subscription, superseded: superseded.count };
  });

  await logAuditEvent({
    actorType: "platform_admin",
    actorId: ctx.adminId,
    action: "subscription.create",
    targetType: "subscription",
    targetId: created.subscription.id,
    tenantId: body.tenant_id,
    metadata: {
      planName: plan.name,
      billingCycle: body.billing_cycle,
      price,
      currency: resolvedCurrency,
      periodEnd: periodEnd.toISOString(),
      invoiceCreated: body.create_invoice,
      supersededSubscriptions: created.superseded,
    },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(toSnakeCase(created.subscription), { status: 201 });
});
