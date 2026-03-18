import { NextRequest, NextResponse } from "next/server";
import { withPlatformAdmin } from "@/lib/admin-api-utils";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";

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

  const users = await prisma.user.findMany({
    where,
    include: {
      tenant: {
        select: { id: true, name: true, slug: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const result = users.map((user) => ({
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

  return NextResponse.json(toSnakeCase(result));
});
