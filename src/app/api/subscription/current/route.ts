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
    return NextResponse.json(null);
  }

  return NextResponse.json(toSnakeCase(subscription));
});
