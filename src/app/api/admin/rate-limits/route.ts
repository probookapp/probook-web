import { NextRequest, NextResponse } from "next/server";
import { withPlatformAdmin } from "@/lib/admin-api-utils";
import { prisma } from "@/lib/db";
import { toSnakeCase, parseListPagination, nextCursorOf } from "@/lib/api-utils";

export const GET = withPlatformAdmin(async (req: NextRequest, _ctx) => {
  // Opt-in cursor pagination (audit ADM-13): flat lean log rows (scalars only,
  // newest first) — the client groups by tenant itself. The legacy path below
  // keeps the grouped shape unchanged.
  const page = parseListPagination(req);
  if (page) {
    const cursorId = page.cursor
      ? (await prisma.rateLimitLog.findUnique({
          where: { id: page.cursor },
          select: { id: true },
        }))?.id ?? null
      : null;
    const data = await prisma.rateLimitLog.findMany({
      where: { flagged: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: page.limit,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    });
    return NextResponse.json(
      toSnakeCase({ data, nextCursor: nextCursorOf(data, page.limit) })
    );
  }

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
