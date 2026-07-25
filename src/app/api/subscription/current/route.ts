import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toSnakeCase, withAuth } from "@/lib/api-utils";

export const GET = withAuth(async (_req: NextRequest, ctx) => {
  const now = new Date();

  // A real, currently-active paid subscription within its paid period wins.
  const activeSubscription = await prisma.subscription.findFirst({
    where: { tenantId: ctx.tenantId, status: "active" },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });
  if (activeSubscription && activeSubscription.currentPeriodEnd > now) {
    return NextResponse.json(toSnakeCase(activeSubscription));
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { trialStartedAt: true, trialEndsAt: true },
  });

  // Latest request drives pending / rejected messaging (surfaced in every state,
  // including during a trial, so the plans overlay never loses track of it).
  const latestRequest = await prisma.subscriptionRequest.findFirst({
    where: { tenantId: ctx.tenantId },
    orderBy: { createdAt: "desc" },
  });
  const pendingRequest = latestRequest?.status === "pending";
  const requestExtras: Record<string, unknown> = {
    pending_request: pendingRequest,
    ...(latestRequest?.status === "rejected"
      ? { rejected_request: true, rejection_reason: latestRequest.adminNotes ?? null }
      : {}),
  };

  // Trial still running → full (non-demo) access. Surface a pending request too,
  // so opening the plans overlay early shows "in review" instead of the picker.
  if (tenant?.trialEndsAt && tenant.trialEndsAt > now) {
    return NextResponse.json({
      status: "trial",
      is_trial: true,
      trial_started_at: tenant.trialStartedAt?.toISOString() ?? null,
      trial_ends_at: tenant.trialEndsAt.toISOString(),
      period_end: tenant.trialEndsAt.toISOString(),
      pending_request: pendingRequest,
    });
  }

  // No valid access. A subscription (even lapsed) outranks a stale signup trial
  // for wall messaging. An "active" row past its period reads as expired, so
  // access lapses immediately without depending on the expiry cron.
  const latestSubscription =
    activeSubscription ??
    (await prisma.subscription.findFirst({
      where: { tenantId: ctx.tenantId },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
    }));

  if (latestSubscription) {
    const snake = toSnakeCase(latestSubscription) as Record<string, unknown>;
    const effectiveStatus =
      latestSubscription.status === "active" ? "expired" : latestSubscription.status;
    return NextResponse.json({ ...snake, status: effectiveStatus, ...requestExtras });
  }

  // Trial existed but has lapsed.
  if (tenant?.trialEndsAt) {
    return NextResponse.json({
      status: "trial_expired",
      trial_ends_at: tenant.trialEndsAt.toISOString(),
      ...requestExtras,
    });
  }

  // Never had a subscription or trial — but may still have a request in flight.
  if (pendingRequest || requestExtras.rejected_request) {
    return NextResponse.json({ status: null, ...requestExtras });
  }
  return NextResponse.json(null);
});
