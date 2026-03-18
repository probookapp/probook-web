import { NextRequest, NextResponse } from "next/server";
import { withPlatformAdmin } from "@/lib/admin-api-utils";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";

export const GET = withPlatformAdmin(async (_req: NextRequest, ctx) => {
  const tenantId = ctx.params?.tenantId;
  if (!tenantId) {
    return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });
  }

  const referralCode = await prisma.referralCode.findUnique({
    where: { tenantId },
    include: {
      tenant: {
        select: { id: true, name: true, slug: true },
      },
      referrals: {
        select: {
          id: true,
          referredTenantId: true,
          status: true,
          convertedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!referralCode) {
    return NextResponse.json({ error: "No referral code found for this tenant" }, { status: 404 });
  }

  return NextResponse.json(toSnakeCase(referralCode));
});
