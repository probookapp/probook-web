import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";
import { withSuperAdmin, logAuditEvent, getClientIp } from "@/lib/admin-api-utils";

export const POST = withSuperAdmin(async (req: NextRequest, ctx) => {
  const id = ctx.params?.id;
  if (!id) {
    return NextResponse.json({ error: "Missing request ID" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({})) as { admin_notes?: string };
  const adminNotes = body.admin_notes || null;

  const request = await prisma.subscriptionRequest.findUnique({
    where: { id },
  });

  if (!request) {
    return NextResponse.json({ error: "Subscription request not found" }, { status: 404 });
  }

  if (request.status !== "pending") {
    return NextResponse.json({ error: "Request has already been reviewed" }, { status: 400 });
  }

  // Look up the target plan with prices
  const plan = await prisma.plan.findUnique({
    where: { id: request.targetPlanId },
    include: { prices: true },
  });

  if (!plan) {
    return NextResponse.json({ error: "Target plan not found" }, { status: 400 });
  }

  // Resolve price for the requested currency
  const requestCurrency = request.currency || plan.currency;
  const priceRow = plan.prices.find((p) => p.currency === requestCurrency);
  const monthlyPrice = priceRow?.monthlyPrice ?? plan.monthlyPrice;
  const yearlyPrice = priceRow?.yearlyPrice ?? plan.yearlyPrice;
  const resolvedCurrency = priceRow?.currency ?? plan.currency;

  // Calculate price based on billing cycle
  let price = request.billingCycle === "monthly" ? monthlyPrice : yearlyPrice;
  let discountAmount = 0;
  let couponId: string | null = null;

  // Handle coupon if present
  if (request.couponCode) {
    const coupon = await prisma.coupon.findUnique({
      where: { code: request.couponCode },
      include: {
        planRestrictions: true,
      },
    });

    if (coupon && coupon.isActive && (!coupon.expiresAt || coupon.expiresAt > new Date()) && (coupon.maxUses === null || coupon.currentUses < coupon.maxUses)) {
      // Check plan restrictions
      const hasRestrictions = coupon.planRestrictions.length > 0;
      const planAllowed = !hasRestrictions || coupon.planRestrictions.some((r) => r.planId === plan.id);

      if (planAllowed) {
        if (coupon.discountType === "percentage") {
          discountAmount = Math.floor(price * coupon.discountValue / 100);
        } else {
          discountAmount = coupon.discountValue;
        }

        // Floor at 0
        price = Math.max(0, price - discountAmount);
        couponId = coupon.id;

        // Increment coupon uses
        await prisma.coupon.update({
          where: { id: coupon.id },
          data: { currentUses: { increment: 1 } },
        });
      }
    }
  }

  const now = new Date();
  const periodEnd = new Date(now);
  if (request.billingCycle === "monthly") {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  } else {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  }

  // Count existing invoices for sequential numbering
  const invoiceCount = await prisma.subscriptionInvoice.count();

  const result = await prisma.$transaction(async (tx) => {
    // Update the request
    const updatedRequest = await tx.subscriptionRequest.update({
      where: { id },
      data: {
        status: "approved",
        reviewedBy: ctx.adminId,
        reviewedAt: now,
        adminNotes,
      },
    });

    let subscription;

    if (request.requestType === "new") {
      subscription = await tx.subscription.create({
        data: {
          tenantId: request.tenantId,
          planId: plan.id,
          status: "active",
          billingCycle: request.billingCycle,
          priceAtPurchase: price,
          currency: resolvedCurrency,
          couponId,
          discountAmount,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          approvedAt: now,
          approvedBy: ctx.adminId,
        },
        include: { plan: true },
      });
    } else if (request.requestType === "upgrade" || request.requestType === "downgrade") {
      const activeSubscription = await tx.subscription.findFirst({
        where: { tenantId: request.tenantId, status: "active" },
        orderBy: { createdAt: "desc" },
      });

      if (activeSubscription) {
        subscription = await tx.subscription.update({
          where: { id: activeSubscription.id },
          data: {
            planId: plan.id,
            priceAtPurchase: price,
            discountAmount,
            couponId,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            approvedAt: now,
            approvedBy: ctx.adminId,
          },
          include: { plan: true },
        });
      } else {
        // Fallback: create new subscription
        subscription = await tx.subscription.create({
          data: {
            tenantId: request.tenantId,
            planId: plan.id,
            status: "active",
            billingCycle: request.billingCycle,
            priceAtPurchase: price,
            currency: resolvedCurrency,
            couponId,
            discountAmount,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            approvedAt: now,
            approvedBy: ctx.adminId,
          },
          include: { plan: true },
        });
      }
    } else if (request.requestType === "renewal") {
      const latestSubscription = await tx.subscription.findFirst({
        where: { tenantId: request.tenantId },
        orderBy: { createdAt: "desc" },
      });

      if (latestSubscription) {
        subscription = await tx.subscription.update({
          where: { id: latestSubscription.id },
          data: {
            status: "active",
            priceAtPurchase: price,
            discountAmount,
            couponId,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            approvedAt: now,
            approvedBy: ctx.adminId,
          },
          include: { plan: true },
        });
      } else {
        subscription = await tx.subscription.create({
          data: {
            tenantId: request.tenantId,
            planId: plan.id,
            status: "active",
            billingCycle: request.billingCycle,
            priceAtPurchase: price,
            currency: resolvedCurrency,
            couponId,
            discountAmount,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            approvedAt: now,
            approvedBy: ctx.adminId,
          },
          include: { plan: true },
        });
      }
    } else {
      throw new Error(`Unknown request type: ${request.requestType}`);
    }

    // Update tenant status to active
    await tx.tenant.update({
      where: { id: request.tenantId },
      data: { status: "active" },
    });

    // Create subscription invoice
    await tx.subscriptionInvoice.create({
      data: {
        subscriptionId: subscription.id,
        invoiceNumber: `PLAT-INV-${invoiceCount + 1}`,
        tenantId: request.tenantId,
        amount: price,
        currency: plan.currency,
        status: "unpaid",
        periodStart: now,
        periodEnd: periodEnd,
      },
    });

    return { ...updatedRequest, subscription };
  });

  await logAuditEvent({
    actorType: "platform_admin",
    actorId: ctx.adminId,
    action: "subscription_request.approve",
    targetType: "subscription_request",
    targetId: id,
    tenantId: request.tenantId,
    metadata: {
      planName: plan.name,
      price,
      discountAmount,
      requestType: request.requestType,
      billingCycle: request.billingCycle,
    },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(toSnakeCase(result));
});
