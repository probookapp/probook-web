import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";
import { withPlatformAdmin } from "@/lib/admin-api-utils";

// Recent error events, sourced from audit logs whose action contains "error".
// Mirrors the count surfaced on the System Health page (last 24h).
export const GET = withPlatformAdmin(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const logs = await prisma.auditLog.findMany({
    where: {
      action: { contains: "error" },
      createdAt: { gte: twentyFourHoursAgo },
    },
    include: {
      admin: { select: { displayName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const tenantIds = [...new Set(logs.map((l) => l.tenantId).filter(Boolean))] as string[];
  const tenants = tenantIds.length > 0
    ? await prisma.tenant.findMany({
        where: { id: { in: tenantIds } },
        select: { id: true, name: true },
      })
    : [];
  const tenantMap = new Map(tenants.map((t) => [t.id, t.name]));

  const enriched = logs.map((log) => ({
    id: log.id,
    action: log.action,
    actorType: log.actorType,
    actorName: log.admin?.displayName || log.actorId,
    targetType: log.targetType,
    targetId: log.targetId,
    tenantId: log.tenantId,
    tenantName: log.tenantId ? tenantMap.get(log.tenantId) || null : null,
    metadata: log.metadata,
    ipAddress: log.ipAddress,
    createdAt: log.createdAt,
  }));

  return NextResponse.json(toSnakeCase(enriched));
});
