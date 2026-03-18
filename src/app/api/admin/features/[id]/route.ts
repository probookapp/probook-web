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
import { updateFeatureSchema } from "@/lib/validations";

export const GET = withPlatformAdmin(async (_req, ctx) => {
  const id = ctx.params?.id;
  const feature = await prisma.featureFlag.findUnique({
    where: { id },
    include: {
      planFeatures: { include: { plan: true } },
    },
  });
  if (!feature) {
    return NextResponse.json({ error: "Feature not found" }, { status: 404 });
  }
  return NextResponse.json(toSnakeCase(feature));
});

export const PUT = withSuperAdmin(async (req, ctx) => {
  const id = ctx.params?.id;
  const body = await validateBody(req, updateFeatureSchema);
  if (isValidationError(body)) return body;

  const existing = await prisma.featureFlag.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Feature not found" }, { status: 404 });
  }

  const feature = await prisma.featureFlag.update({
    where: { id },
    data: {
      key: body.key ?? existing.key,
      name: body.name ?? existing.name,
      description: body.description !== undefined ? body.description : existing.description,
      nameTranslations: body.name_translations !== undefined ? body.name_translations : existing.nameTranslations,
      descriptionTranslations: body.description_translations !== undefined ? body.description_translations : existing.descriptionTranslations,
      isGlobal: body.is_global !== undefined ? body.is_global : existing.isGlobal,
    },
  });

  // Update plan links if plan_ids provided
  if (body.plan_ids !== undefined && Array.isArray(body.plan_ids)) {
    // Remove existing links
    await prisma.planFeature.deleteMany({ where: { featureId: id } });

    // Create new links
    if (body.plan_ids.length > 0) {
      await prisma.planFeature.createMany({
        data: body.plan_ids.map((planId: string) => ({
          planId,
          featureId: id!,
        })),
      });
    }
  }

  // Re-fetch with relations
  const result = await prisma.featureFlag.findUnique({
    where: { id },
    include: {
      planFeatures: { include: { plan: true } },
    },
  });

  await logAuditEvent({
    actorType: "platform_admin",
    actorId: ctx.adminId,
    action: "feature.update",
    targetType: "feature_flag",
    targetId: id,
    metadata: { changes: body },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(toSnakeCase(result));
});
