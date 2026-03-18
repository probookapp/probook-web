import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";
import { withPlatformAdmin } from "@/lib/admin-api-utils";

export const GET = withPlatformAdmin(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const subscriptions = await prisma.subscription.findMany({
    where: status ? { status } : undefined,
    include: {
      plan: true,
      tenant: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(toSnakeCase(subscriptions));
});
