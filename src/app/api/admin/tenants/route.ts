import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toSnakeCase, parseListPagination, nextCursorOf } from "@/lib/api-utils";
import { withPlatformAdmin } from "@/lib/admin-api-utils";

export const GET = withPlatformAdmin(async (req) => {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const search = searchParams.get("search");
  const trial = searchParams.get("trial");

  const where: Record<string, unknown> = {};

  if (status) {
    where.status = status;
  }

  // Trial state is derived from trialEndsAt rather than stored, so the filter
  // is a date comparison: running, lapsed, or never started.
  if (trial === "active") {
    where.trialEndsAt = { gt: new Date() };
  } else if (trial === "expired") {
    where.trialEndsAt = { lte: new Date() };
  } else if (trial === "none") {
    where.trialEndsAt = null;
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
    // The one active subscription (if any) so the list can show which plan a
    // tenant is on — the column used to read a field the route never returned.
    subscriptions: {
      where: { status: "active" },
      orderBy: { createdAt: "desc" as const },
      take: 1,
      select: {
        id: true,
        status: true,
        currentPeriodEnd: true,
        plan: { select: { id: true, name: true, slug: true } },
      },
    },
  } as const;

  type ActiveSubscription = {
    id: string;
    status: string;
    currentPeriodEnd: Date;
    plan: { id: string; name: string; slug: string };
  };

  const project = <
    T extends {
      _count: { subscriptions: number; users: number };
      subscriptions: ActiveSubscription[];
    },
  >(
    tenants: T[]
  ) =>
    tenants.map((tenant) => {
      const active = tenant.subscriptions[0];
      return {
        ...tenant,
        subscriptionCount: tenant._count.subscriptions,
        userCount: tenant._count.users,
        planName: active?.plan?.name ?? null,
        planId: active?.plan?.id ?? null,
        subscriptions: undefined,
        _count: undefined,
      };
    });

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
