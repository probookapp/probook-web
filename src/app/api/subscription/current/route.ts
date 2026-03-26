import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toSnakeCase, withAuth } from "@/lib/api-utils";

export const GET = withAuth(async (_req: NextRequest, ctx) => {
  const subscription = await prisma.subscription.findFirst({
    where: { tenantId: ctx.tenantId },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });

  if (!subscription) {
    // Only check for pending requests when there's no active subscription
    const pendingRequest = await prisma.subscriptionRequest.findFirst({
      where: {
        tenantId: ctx.tenantId,
        status: "pending",
      },
    });

    return NextResponse.json(
      pendingRequest ? { pending_request: true } : null
    );
  }

  return NextResponse.json(toSnakeCase(subscription));
});
