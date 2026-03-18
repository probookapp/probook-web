import { NextRequest, NextResponse } from "next/server";
import { withPlatformAdmin } from "@/lib/admin-api-utils";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";

export const GET = withPlatformAdmin(async (_req: NextRequest, _ctx) => {
  const logs = await prisma.rateLimitLog.findMany({
    where: { flagged: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  // Group by tenant
  const grouped: Record<string, { tenant_id: string; endpoints: Record<string, unknown>[] }> = {};
  for (const log of logs) {
    if (!grouped[log.tenantId]) {
      grouped[log.tenantId] = {
        tenant_id: log.tenantId,
        endpoints: [],
      };
    }
    grouped[log.tenantId].endpoints.push(toSnakeCase(log));
  }

  return NextResponse.json(Object.values(grouped));
});
