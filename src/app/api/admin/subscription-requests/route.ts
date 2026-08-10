import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toSnakeCase, parseListPagination, nextCursorOf } from "@/lib/api-utils";
import { withPlatformAdmin } from "@/lib/admin-api-utils";

export const GET = withPlatformAdmin(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const search = searchParams.get("search");

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  // Requests are only ever looked up by who sent them.
  if (search) {
    where.tenant = {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { slug: { contains: search, mode: "insensitive" } },
      ],
    };
  }

  /** Attach the target plan, which is a plain id column rather than a relation. */
  async function withPlans<T extends { targetPlanId: string }>(requests: T[]) {
    const planIds = [...new Set(requests.map((r) => r.targetPlanId))];
    const plans = planIds.length
      ? await prisma.plan.findMany({ where: { id: { in: planIds } } })
      : [];
    const planMap = new Map(plans.map((p) => [p.id, p]));
    return requests.map((r) => ({ ...r, targetPlan: planMap.get(r.targetPlanId) || null }));
  }

  // Opt-in cursor pagination, matching the other admin lists: the pending queue
  // is unbounded otherwise, and it is the busiest list in the dashboard.
  const page = parseListPagination(req);
  if (page) {
    const cursorId = page.cursor
      ? (
          await prisma.subscriptionRequest.findUnique({
            where: { id: page.cursor },
            select: { id: true },
          })
        )?.id ?? null
      : null;
    const requests = await prisma.subscriptionRequest.findMany({
      where,
      include: { tenant: { select: { id: true, name: true, slug: true, status: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: page.limit,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    });
    return NextResponse.json(
      toSnakeCase({
        data: await withPlans(requests),
        nextCursor: nextCursorOf(requests, page.limit),
      })
    );
  }

  const requests = await prisma.subscriptionRequest.findMany({
    where,
    include: { tenant: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(toSnakeCase(await withPlans(requests)));
});
