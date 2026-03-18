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
import { updatePlanSchema } from "@/lib/validations";

export const GET = withPlatformAdmin(async (_req, ctx) => {
  const id = ctx.params?.id;
  const plan = await prisma.plan.findUnique({
    where: { id },
    include: {
      features: { include: { feature: true } },
      prices: true,
      quotas: true,
    },
  });
  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }
  return NextResponse.json(toSnakeCase(plan));
});

export const PUT = withSuperAdmin(async (req, ctx) => {
  const id = ctx.params?.id;
  const body = await validateBody(req, updatePlanSchema);
  if (isValidationError(body)) return body;

  const existing = await prisma.plan.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  const plan = await prisma.plan.update({
    where: { id },
    data: {
      slug: body.slug ?? existing.slug,
      name: body.name ?? existing.name,
      description: body.description !== undefined ? body.description : existing.description,
      nameTranslations: body.name_translations !== undefined ? body.name_translations : existing.nameTranslations,
      descriptionTranslations: body.description_translations !== undefined ? body.description_translations : existing.descriptionTranslations,
      monthlyPrice: body.monthly_price ?? existing.monthlyPrice,
      yearlyPrice: body.yearly_price ?? existing.yearlyPrice,
      currency: body.currency ?? existing.currency,
      trialDays: body.trial_days ?? existing.trialDays,
      sortOrder: body.sort_order ?? existing.sortOrder,
    },
  });

  // Replace PlanPrice rows if provided
  if (Array.isArray(body.prices)) {
    await prisma.planPrice.deleteMany({ where: { planId: id } });
    if (body.prices.length > 0) {
      await prisma.planPrice.createMany({
        data: body.prices.map((p: { currency: string; monthly_price: number; yearly_price: number }) => ({
          planId: id!,
          currency: p.currency,
          monthlyPrice: p.monthly_price,
          yearlyPrice: p.yearly_price,
        })),
      });
    }
  }

  const result = await prisma.plan.findUnique({
    where: { id },
    include: { features: { include: { feature: true } }, prices: true, quotas: true },
  });

  await logAuditEvent({
    actorType: "platform_admin",
    actorId: ctx.adminId,
    action: "plan.update",
    targetType: "plan",
    targetId: plan.id,
    metadata: { changes: body },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(toSnakeCase(result));
});

export const DELETE = withSuperAdmin(async (req, ctx) => {
  const id = ctx.params?.id;

  const existing = await prisma.plan.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  await prisma.plan.update({
    where: { id },
    data: { isActive: false },
  });

  await logAuditEvent({
    actorType: "platform_admin",
    actorId: ctx.adminId,
    action: "plan.delete",
    targetType: "plan",
    targetId: id,
    metadata: { slug: existing.slug },
    ipAddress: getClientIp(req),
  });

  return new NextResponse(null, { status: 204 });
});
