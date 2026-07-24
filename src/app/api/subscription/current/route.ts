import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toSnakeCase, withAuth } from "@/lib/api-utils";

export const GET = withAuth(async (_req: NextRequest, ctx) => {
  const now = new Date();

  // A real, currently-active paid subscription always wins.
  const activeSubscription = await prisma.subscription.findFirst({
    where: { tenantId: ctx.tenantId, status: "active" },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });
  if (activeSubscription) {
    return NextResponse.json(toSnakeCase(activeSubscription));
  }

  // No active subscription: check the tenant's free-trial window.
  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { trialStartedAt: true, trialEndsAt: true },
  });

  // Trial still running → full (non-demo) access. period_end drives the
  // existing expiry logic; is_trial lets the client show a trial banner.
  if (tenant?.trialEndsAt && tenant.trialEndsAt > now) {
    return NextResponse.json({
      status: "trial",
      is_trial: true,
      trial_started_at: tenant.trialStartedAt?.toISOString() ?? null,
      trial_ends_at: tenant.trialEndsAt.toISOString(),
      period_end: tenant.trialEndsAt.toISOString(),
    });
  }

  // A pending request takes precedence over expired states so the user sees
  // "in review" rather than a plan picker.
  const pendingRequest = await prisma.subscriptionRequest.findFirst({
    where: { tenantId: ctx.tenantId, status: "pending" },
  });
  if (pendingRequest) {
    return NextResponse.json({ pending_request: true });
  }

  // Trial existed but has lapsed → dedicated "trial ended" wall.
  if (tenant?.trialEndsAt) {
    return NextResponse.json({
      status: "trial_expired",
      trial_ends_at: tenant.trialEndsAt.toISOString(),
    });
  }

  // Otherwise surface the latest non-active subscription (expired / cancelled /
  // suspended) so the wall shows the right message, else nothing.
  const latestSubscription = await prisma.subscription.findFirst({
    where: { tenantId: ctx.tenantId },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });
  if (latestSubscription) {
    return NextResponse.json(toSnakeCase(latestSubscription));
  }

  return NextResponse.json(null);
});
