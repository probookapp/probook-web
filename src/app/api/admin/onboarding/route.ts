import { NextRequest, NextResponse } from "next/server";
import { withPlatformAdmin } from "@/lib/admin-api-utils";
import { prisma } from "@/lib/db";
import { toSnakeCase, parseListPagination, nextCursorOf } from "@/lib/api-utils";

const ALL_STEPS = [
  "company_setup",
  "first_client",
  "first_product",
  "first_quote",
  "first_invoice",
];

const TENANT_SELECT = {
  id: true,
  name: true,
  slug: true,
  status: true,
  createdAt: true,
  onboardingSteps: {
    select: {
      stepKey: true,
      completed: true,
      completedAt: true,
    },
  },
} as const;

export const GET = withPlatformAdmin(async (req: NextRequest, _ctx) => {
  // Opt-in cursor pagination (audit ADM-13): same computed projection
  // (tenant scalars + step rows + completion %), keyset order.
  const page = parseListPagination(req);

  const tenants = page
    ? await prisma.tenant.findMany({
        select: TENANT_SELECT,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: page.limit,
        ...(page.cursor &&
        (await prisma.tenant.findUnique({ where: { id: page.cursor }, select: { id: true } }))
          ? { cursor: { id: page.cursor }, skip: 1 }
          : {}),
      })
    : await prisma.tenant.findMany({
        select: TENANT_SELECT,
        orderBy: { createdAt: "desc" },
      });

  const result = tenants.map((tenant) => {
    const completedCount = tenant.onboardingSteps.filter((s) => s.completed).length;
    const totalSteps = ALL_STEPS.length;
    const completionPercentage = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      createdAt: tenant.createdAt,
      steps: tenant.onboardingSteps,
      completedCount,
      totalSteps,
      completionPercentage,
    };
  });

  if (page) {
    return NextResponse.json(
      toSnakeCase({ data: result, nextCursor: nextCursorOf(result, page.limit) })
    );
  }

  return NextResponse.json(toSnakeCase(result));
});
