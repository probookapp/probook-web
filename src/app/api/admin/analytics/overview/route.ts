import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withPlatformAdmin } from "@/lib/admin-api-utils";

export const GET = withPlatformAdmin(async () => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Run all counts in parallel
  const [
    totalTenants,
    activeTenants,
    pendingTenants,
    totalUsers,
    newSignupsThisMonth,
    activeSubscriptions,
    paidInvoices,
    subscriptionBreakdown,
  ] = await Promise.all([
    prisma.tenant.count(),
    prisma.tenant.count({ where: { status: "active" } }),
    prisma.tenant.count({ where: { status: "pending" } }),
    prisma.user.count(),
    prisma.tenant.count({
      where: { createdAt: { gte: startOfMonth } },
    }),
    prisma.subscription.findMany({
      where: { status: "active" },
      select: {
        billingCycle: true,
        priceAtPurchase: true,
      },
    }),
    prisma.subscriptionInvoice.aggregate({
      where: { status: "paid" },
      _sum: { amount: true },
    }),
    prisma.subscription.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
  ]);

  // Calculate MRR: monthly subs contribute priceAtPurchase, yearly contribute priceAtPurchase / 12
  let mrr = 0;
  for (const sub of activeSubscriptions) {
    if (sub.billingCycle === "monthly") {
      mrr += sub.priceAtPurchase;
    } else {
      mrr += Math.round(sub.priceAtPurchase / 12);
    }
  }

  // Build subscription breakdown
  const breakdown: Record<string, number> = {
    active: 0,
    pending: 0,
    expired: 0,
    suspended: 0,
    cancelled: 0,
  };
  for (const group of subscriptionBreakdown) {
    breakdown[group.status] = group._count.id;
  }

  return NextResponse.json({
    total_tenants: totalTenants,
    active_tenants: activeTenants,
    pending_tenants: pendingTenants,
    total_users: totalUsers,
    new_signups_this_month: newSignupsThisMonth,
    mrr,
    total_revenue: paidInvoices._sum.amount || 0,
    subscription_breakdown: breakdown,
  });
});
