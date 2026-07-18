import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export const POST = withAuth(async (_req: NextRequest, ctx) => {
  const id = ctx.params?.id;
  if (!id) {
    return NextResponse.json({ error: "Missing announcement id" }, { status: 400 });
  }

  const userId = ctx.session.userId;
  const tenantId = ctx.tenantId;
  const now = new Date();

  // Only allow dismissing announcements that are actually visible to this
  // tenant (published, not expired, and targeting it) — same visibility rules
  // as the /api/announcements/active route.
  const activeSubscription = await prisma.subscription.findFirst({
    where: { tenantId, status: "active" },
    select: { planId: true },
  });

  const targetConditions: Record<string, unknown>[] = [
    { targetType: "all" },
    { targetType: "tenant", targetId: tenantId },
  ];
  if (activeSubscription?.planId) {
    targetConditions.push({ targetType: "plan", targetId: activeSubscription.planId });
  }

  const announcement = await prisma.announcement.findFirst({
    where: {
      AND: [
        { id },
        { OR: targetConditions },
        { publishedAt: { lte: now } },
        {
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: now } },
          ],
        },
      ],
    },
    select: { id: true },
  });

  if (!announcement) {
    return NextResponse.json({ error: "Announcement not found" }, { status: 404 });
  }

  // Upsert to avoid duplicates
  await prisma.announcementDismissal.upsert({
    where: {
      announcementId_userId: {
        announcementId: id,
        userId,
      },
    },
    create: {
      announcementId: id,
      userId,
    },
    update: {},
  });

  return NextResponse.json({ success: true }, { status: 201 });
});
