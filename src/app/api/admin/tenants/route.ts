import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";
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

  const tenants = await prisma.tenant.findMany({
    where,
    include: {
      _count: {
        select: {
          subscriptions: true,
          users: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const result = tenants.map((tenant) => ({
    ...tenant,
    subscriptionCount: tenant._count.subscriptions,
    userCount: tenant._count.users,
    _count: undefined,
  }));

  return NextResponse.json(toSnakeCase(result));
});
