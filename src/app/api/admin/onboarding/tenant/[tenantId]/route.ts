import { NextRequest, NextResponse } from "next/server";
import { withPlatformAdmin } from "@/lib/admin-api-utils";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";

export const GET = withPlatformAdmin(async (_req: NextRequest, ctx) => {
  const tenantId = ctx.params?.tenantId;
  if (!tenantId) {
    return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      onboardingSteps: {
        select: {
          id: true,
          stepKey: true,
          completed: true,
          completedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  return NextResponse.json(toSnakeCase(tenant));
});
