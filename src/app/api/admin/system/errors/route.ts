import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";
import { withPlatformAdmin } from "@/lib/admin-api-utils";

// Recent error / security events (last 24h): audit logs whose action mentions an
// error or failure, PLUS failed platform-admin login attempts (a real, always-on
// source of security-relevant events, so the panel isn't empty by construction).
export const GET = withPlatformAdmin(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [logs, failedLogins] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        OR: [{ action: { contains: "error" } }, { action: { contains: "fail" } }],
        createdAt: { gte: twentyFourHoursAgo },
      },
      include: { admin: { select: { displayName: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.adminLoginAttempt.findMany({
      where: { success: false, createdAt: { gte: twentyFourHoursAgo } },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
  ]);

  const tenantIds = [...new Set(logs.map((l) => l.tenantId).filter(Boolean))] as string[];
  const tenants = tenantIds.length > 0
    ? await prisma.tenant.findMany({
        where: { id: { in: tenantIds } },
        select: { id: true, name: true },
      })
    : [];
  const tenantMap = new Map(tenants.map((t) => [t.id, t.name]));

  const auditEvents = logs.map((log) => ({
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

  const loginEvents = failedLogins.map((a) => ({
    id: a.id,
    action: "admin.login.failed",
    actorType: "platform_admin" as const,
    actorName: a.username,
    targetType: null,
    targetId: null,
    tenantId: null,
    tenantName: null,
    metadata: null,
    ipAddress: a.ipAddress,
    createdAt: a.createdAt,
  }));

  const enriched = [...auditEvents, ...loginEvents]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);

  return NextResponse.json(toSnakeCase(enriched));
});
