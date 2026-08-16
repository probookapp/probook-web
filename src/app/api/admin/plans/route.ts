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

  // An offer on sale has to contain something.
  //
  // A plan that links no feature refuses every gated module to whoever
  // subscribes to it, and does so in silence: they pay, sign in, and the till
  // and the purchasing they were sold are simply not there. Nothing errors,
  // nothing is logged, and the first anyone hears of it is the customer.
  //
  // Refusing here rather than at approval puts the mistake in front of the
  // person making it, at the moment they make it. A draft can still be written
  // — it just cannot be active until it says what it includes.
  const active = body.is_active ?? true;
  if (active && !(Array.isArray(body.feature_ids) && body.feature_ids.length > 0)) {
    return NextResponse.json(
      {
        error:
          "An active plan must include at least one feature. Save it as inactive " +
          "while you decide, or tick what it includes.",
        code: "PLAN_HAS_NO_FEATURES",
      },
      { status: 400 }
    );
  }
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
