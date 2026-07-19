import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toSnakeCase, parseListPagination, nextCursorOf } from "@/lib/api-utils";
import { withPlatformAdmin } from "@/lib/admin-api-utils";

export const GET = withPlatformAdmin(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const where = status ? { status } : undefined;

  // Opt-in cursor pagination (audit ADM-13): scalars + the one-row plan and
  // tenant relations (both cheap), same status filter, keyset order.
  const page = parseListPagination(req);
  if (page) {
    const cursorId = page.cursor
      ? (await prisma.subscription.findUnique({
          where: { id: page.cursor },
          select: { id: true },
        }))?.id ?? null
      : null;
    const data = await prisma.subscription.findMany({
      where,
      include: {
        plan: true,
        tenant: { select: { id: true, name: true, slug: true, status: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: page.limit,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    });
    return NextResponse.json(
      toSnakeCase({ data, nextCursor: nextCursorOf(data, page.limit) })
    );
  }

  const subscriptions = await prisma.subscription.findMany({
    where,
    include: {
      plan: true,
      tenant: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(toSnakeCase(subscriptions));
});
