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
import { createFeatureSchema } from "@/lib/validations";

export const GET = withPlatformAdmin(async () => {
  const features = await prisma.featureFlag.findMany({
    include: {
      planFeatures: { include: { plan: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(toSnakeCase(features));
});

export const POST = withSuperAdmin(async (req, ctx) => {
  const body = await validateBody(req, createFeatureSchema);
  if (isValidationError(body)) return body;

  const feature = await prisma.featureFlag.create({
    data: {
      key: body.key,
      name: body.name,
      description: body.description || null,
      nameTranslations: body.name_translations || null,
      descriptionTranslations: body.description_translations || null,
      isGlobal: body.is_global ?? true,
    },
  });

  // Create PlanFeature links if plan_ids provided
  if (body.plan_ids && Array.isArray(body.plan_ids) && body.plan_ids.length > 0) {
    await prisma.planFeature.createMany({
      data: body.plan_ids.map((planId: string) => ({
        planId,
        featureId: feature.id,
      })),
    });
  }

  // Re-fetch with relations
  const result = await prisma.featureFlag.findUnique({
    where: { id: feature.id },
    include: {
      planFeatures: { include: { plan: true } },
    },
  });

  await logAuditEvent({
    actorType: "platform_admin",
    actorId: ctx.adminId,
    action: "feature.create",
    targetType: "feature_flag",
    targetId: feature.id,
    metadata: { key: feature.key, name: feature.name },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(toSnakeCase(result), { status: 201 });
});
