import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withPlatformAdmin } from "@/lib/admin-api-utils";

export const GET = withPlatformAdmin(async () => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Run all counts in parallel
  // "Soon" for the attention list: a week out.
  const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [
    totalTenants,
    activeTenants,
    pendingTenants,
    totalUsers,
    newSignupsThisMonth,
    activeSubscriptions,
    paidInvoices,
    subscriptionBreakdown,
    trialsRunning,
    trialsEndingSoon,
    trialsConverted,
    pendingRequests,
    unpaidInvoices,
    subscriptionsExpiringSoon,
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
        currency: true,
      },
    }),
    prisma.subscriptionInvoice.groupBy({
      by: ["currency"],
      where: { status: "paid" },
      _sum: { amount: true },
    }),
    prisma.subscription.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
    // Trial funnel: running now, ending within the week, and how many tenants
    // that started a trial ended up with a subscription.
    prisma.tenant.count({ where: { trialEndsAt: { gt: now } } }),
    prisma.tenant.count({ where: { trialEndsAt: { gt: now, lte: inSevenDays } } }),
    prisma.tenant.count({
      where: { trialStartedAt: { not: null }, subscriptions: { some: {} } },
    }),
    // The three queues that need someone to act.
    prisma.subscriptionRequest.count({ where: { status: "pending" } }),
    prisma.subscriptionInvoice.count({ where: { status: "unpaid" } }),
    prisma.subscription.count({
      where: { status: "active", currentPeriodEnd: { gt: now, lte: inSevenDays } },
    }),
  ]);

  // Calculate MRR per currency (mixed-currency amounts must never be summed
  // into one number): monthly subs contribute priceAtPurchase, yearly
  // contribute priceAtPurchase / 12.
  const mrrByCurrency: Record<string, number> = {};
  for (const sub of activeSubscriptions) {
    const monthly =
      sub.billingCycle === "monthly"
        ? sub.priceAtPurchase
        : Math.round(sub.priceAtPurchase / 12);
    mrrByCurrency[sub.currency] = (mrrByCurrency[sub.currency] || 0) + monthly;
  }
  const mrr = Object.entries(mrrByCurrency)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => ({ currency, amount }));

  // Paid revenue per currency (centimes)
  const totalRevenue = paidInvoices
    .map((group) => ({
      currency: group.currency,
      amount: group._sum.amount || 0,
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));

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
    // Per-currency money figures: [{ currency: "DZD", amount: 1600000 }, ...]
    mrr,
    total_revenue: totalRevenue,
    subscription_breakdown: breakdown,
    trials_running: trialsRunning,
    trials_ending_soon: trialsEndingSoon,
    trials_converted: trialsConverted,
    needs_attention: {
      pending_requests: pendingRequests,
      unpaid_invoices: unpaidInvoices,
      subscriptions_expiring_soon: subscriptionsExpiringSoon,
      trials_ending_soon: trialsEndingSoon,
    },
  });
});
