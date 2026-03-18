import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export const POST = withAuth(async (_req: NextRequest, ctx) => {
  const id = ctx.params?.id;
  if (!id) {
    return NextResponse.json({ error: "Missing announcement id" }, { status: 400 });
  }

  const userId = ctx.session.userId;

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
