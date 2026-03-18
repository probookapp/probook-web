import { NextRequest, NextResponse } from "next/server";
import { withPlatformAdmin } from "@/lib/admin-api-utils";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";

const ALL_STEPS = [
  "company_setup",
  "first_client",
  "first_product",
  "first_quote",
  "first_invoice",
];

export const GET = withPlatformAdmin(async (_req: NextRequest, _ctx) => {
  const tenants = await prisma.tenant.findMany({
    select: {
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
    },
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

  return NextResponse.json(toSnakeCase(result));
});
