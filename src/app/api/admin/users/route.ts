import { NextRequest, NextResponse } from "next/server";
import { withPlatformAdmin } from "@/lib/admin-api-utils";
import { prisma } from "@/lib/db";
import { toSnakeCase, parseListPagination, nextCursorOf } from "@/lib/api-utils";

export const GET = withPlatformAdmin(async (req: NextRequest, _ctx) => {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";

  const where = search
    ? {
        OR: [
          { username: { contains: search, mode: "insensitive" as const } },
          { displayName: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const include = {
    tenant: {
      select: { id: true, name: true, slug: true },
    },
  } as const;

  const project = <T extends { id: string; tenantId: string; username: string; displayName: string | null; role: string; isActive: boolean; createdAt: Date; updatedAt: Date; tenant: unknown }>(users: T[]) =>
    users.map((user) => ({
      id: user.id,
      tenantId: user.tenantId,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      tenant: user.tenant,
    }));

  // Opt-in cursor pagination (audit ADM-13): same projection (safe user
  // fields + tenant name/slug), same search filter, keyset order.
  const page = parseListPagination(req);
  if (page) {
    const cursorId = page.cursor
      ? (await prisma.user.findUnique({
          where: { id: page.cursor },
          select: { id: true },
        }))?.id ?? null
      : null;
    const users = await prisma.user.findMany({
      where,
      include,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: page.limit,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    });
    return NextResponse.json(
      toSnakeCase({ data: project(users), nextCursor: nextCursorOf(users, page.limit) })
    );
  }

  const users = await prisma.user.findMany({
    where,
    include,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(toSnakeCase(project(users)));
});
