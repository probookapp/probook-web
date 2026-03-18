import { NextRequest, NextResponse } from "next/server";
import { withPlatformAdmin } from "@/lib/admin-api-utils";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";

export const GET = withPlatformAdmin(async (_req: NextRequest, _ctx) => {
  const referralCodes = await prisma.referralCode.findMany({
    include: {
      tenant: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      referrals: {
        select: {
          id: true,
          referredTenantId: true,
          status: true,
          convertedAt: true,
          createdAt: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const result = referralCodes.map((rc) => ({
    id: rc.id,
    tenantId: rc.tenantId,
    code: rc.code,
    isActive: rc.isActive,
    createdAt: rc.createdAt,
    tenant: rc.tenant,
    referralsCount: rc.referrals.length,
    convertedCount: rc.referrals.filter((r) => r.status === "converted").length,
    referrals: rc.referrals,
  }));

  return NextResponse.json(toSnakeCase(result));
});
