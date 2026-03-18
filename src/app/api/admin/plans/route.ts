import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";
import {
  withPlatformAdmin,
  withSuperAdmin,
  logAuditEvent,
  getClientIp,
} from "@/lib/admin-api-utils";
import { validateBody, isValidationError } from "@/lib/validate";
import { createPlanSchema } from "@/lib/validations";

export const GET = withPlatformAdmin(async () => {
  const plans = await prisma.plan.findMany({
    include: {
      features: { include: { feature: true } },
      prices: true,
      quotas: true,
    },
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json(toSnakeCase(plans));
});

export const POST = withSuperAdmin(async (req, ctx) => {
  const body = await validateBody(req, createPlanSchema);
  if (isValidationError(body)) return body;
  const plan = await prisma.plan.create({
    data: {
      slug: body.slug,
      name: body.name,
      description: body.description || null,
      nameTranslations: body.name_translations || null,
      descriptionTranslations: body.description_translations || null,
      monthlyPrice: body.monthly_price,
      yearlyPrice: body.yearly_price,
      currency: body.currency || "DZD",
      trialDays: body.trial_days || 0,
      sortOrder: body.sort_order || 0,
    },
  });

  // Create PlanPrice rows if provided
  if (Array.isArray(body.prices) && body.prices.length > 0) {
    await prisma.planPrice.createMany({
      data: body.prices.map((p: { currency: string; monthly_price: number; yearly_price: number }) => ({
        planId: plan.id,
        currency: p.currency,
        monthlyPrice: p.monthly_price,
        yearlyPrice: p.yearly_price,
      })),
    });
  }

  const result = await prisma.plan.findUnique({
    where: { id: plan.id },
    include: { features: { include: { feature: true } }, prices: true, quotas: true },
  });

  await logAuditEvent({
    actorType: "platform_admin",
    actorId: ctx.adminId,
    action: "plan.create",
    targetType: "plan",
    targetId: plan.id,
    metadata: { slug: plan.slug, name: plan.name },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(toSnakeCase(result), { status: 201 });
});
