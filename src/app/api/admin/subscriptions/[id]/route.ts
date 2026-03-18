import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";
import { withPlatformAdmin } from "@/lib/admin-api-utils";

export const GET = withPlatformAdmin(async (_req: NextRequest, ctx) => {
  const id = ctx.params?.id;
  if (!id) {
    return NextResponse.json({ error: "Missing subscription ID" }, { status: 400 });
  }

  const subscription = await prisma.subscription.findUnique({
    where: { id },
    include: {
      plan: true,
      tenant: true,
      invoices: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!subscription) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }

  return NextResponse.json(toSnakeCase(subscription));
});
