import { NextRequest, NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export const GET = withAuth(async (_req: NextRequest, ctx) => {
  const now = new Date();
  const userId = ctx.session.userId;
  const tenantId = ctx.tenantId;

  // Get the tenant's active subscription to check plan-based announcements
  const activeSubscription = await prisma.subscription.findFirst({
    where: {
      tenantId,
      status: "active",
    },
    select: { planId: true },
  });

  const planId = activeSubscription?.planId;

  // Build target conditions
  const targetConditions: Record<string, unknown>[] = [
    { targetType: "all" },
    { targetType: "tenant", targetId: tenantId },
  ];

  if (planId) {
    targetConditions.push({ targetType: "plan", targetId: planId });
  }

  // Get dismissed announcement IDs for this user
  const dismissals = await prisma.announcementDismissal.findMany({
    where: { userId },
    select: { announcementId: true },
  });
  const dismissedIds = dismissals.map((d) => d.announcementId);

  const whereConditions: Record<string, unknown>[] = [
    { OR: targetConditions },
    { publishedAt: { lte: now } },
    {
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: now } },
      ],
    },
  ];

  if (dismissedIds.length > 0) {
    whereConditions.push({ id: { notIn: dismissedIds } });
  }

  const announcements = await prisma.announcement.findMany({
    where: {
      AND: whereConditions,
    },
    orderBy: { publishedAt: "desc" },
  });

  return NextResponse.json(toSnakeCase(announcements));
});
