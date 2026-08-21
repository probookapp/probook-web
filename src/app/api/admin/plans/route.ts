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

  // An offer may carry no add-on module at all: the entry offer is the core
  // product — invoicing, quotes, the catalogue — which is never sold
  // separately. `feature_ids` lists what an offer adds on top of that.
  const active = body.is_active ?? true;

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
      isActive: active,
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

  // Link the plan's feature entitlements if provided
  if (Array.isArray(body.feature_ids) && body.feature_ids.length > 0) {
    await prisma.planFeature.createMany({
      data: body.feature_ids.map((featureId: string) => ({ planId: plan.id, featureId })),
      skipDuplicates: true,
    });
  }

  // Create PlanQuota rows if provided
  if (Array.isArray(body.quotas) && body.quotas.length > 0) {
    await prisma.planQuota.createMany({
      data: body.quotas.map((q: { quota_key: string; limit_value: number }) => ({
        planId: plan.id,
        quotaKey: q.quota_key,
        limitValue: q.limit_value,
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
