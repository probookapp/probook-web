import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toSnakeCase, parseListPagination, nextCursorOf } from "@/lib/api-utils";
import { withPlatformAdmin } from "@/lib/admin-api-utils";

export const GET = withPlatformAdmin(async (req) => {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const search = searchParams.get("search");

  const where: Record<string, unknown> = {};

  if (status) {
    where.status = status;
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { slug: { contains: search, mode: "insensitive" } },
    ];
  }

  const include = {
    _count: {
      select: {
        subscriptions: true,
        users: true,
      },
    },
  } as const;

  const project = <T extends { _count: { subscriptions: number; users: number } }>(tenants: T[]) =>
    tenants.map((tenant) => ({
      ...tenant,
      subscriptionCount: tenant._count.subscriptions,
      userCount: tenant._count.users,
      _count: undefined,
    }));

  // Opt-in cursor pagination (audit ADM-13): same projection (scalars +
  // subscription/user counts), same filters, keyset order.
  const page = parseListPagination(req);
  if (page) {
    const cursorId = page.cursor
      ? (await prisma.tenant.findUnique({
          where: { id: page.cursor },
          select: { id: true },
        }))?.id ?? null
      : null;
    const tenants = await prisma.tenant.findMany({
      where,
      include,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: page.limit,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    });
    const data = project(tenants);
    return NextResponse.json(
      toSnakeCase({ data, nextCursor: nextCursorOf(tenants, page.limit) })
    );
  }

  const tenants = await prisma.tenant.findMany({
    where,
    include,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(toSnakeCase(project(tenants)));
});
