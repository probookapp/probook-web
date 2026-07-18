import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";
import { withPlatformAdmin } from "@/lib/admin-api-utils";

export const GET = withPlatformAdmin(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");
  const adminId = searchParams.get("adminId");
  const tenantId = searchParams.get("tenantId");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");

  const where: Record<string, unknown> = {};
  if (action) where.action = { contains: action };
  if (adminId) where.actorId = adminId;
  if (tenantId) where.tenantId = tenantId;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  // actorId is polymorphic (no FK): resolve admin display names in a batch
  const adminActorIds = [...new Set(logs.filter((l) => l.actorType === "platform_admin").map((l) => l.actorId))];
  const admins = adminActorIds.length > 0
    ? await prisma.platformAdmin.findMany({
        where: { id: { in: adminActorIds } },
        select: { id: true, displayName: true },
      })
    : [];
  const adminMap = new Map(admins.map((a) => [a.id, a.displayName]));

  // Look up tenant names for logs that have tenantId
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
    actorType: log.actorType,
    actorId: log.actorId,
    actorName: adminMap.get(log.actorId) || log.actorId,
    action: log.action,
    targetType: log.targetType,
    targetId: log.targetId,
    tenantId: log.tenantId,
    tenantName: log.tenantId ? tenantMap.get(log.tenantId) || null : null,
    metadata: log.metadata,
    ipAddress: log.ipAddress,
    createdAt: log.createdAt,
  }));

  return NextResponse.json(toSnakeCase({ data: enriched, total, page, limit }));
});
