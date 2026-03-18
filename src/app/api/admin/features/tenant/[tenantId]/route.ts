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
import { updateTenantFeaturesSchema } from "@/lib/validations";

export const GET = withPlatformAdmin(async (_req, ctx) => {
  const tenantId = ctx.params?.tenantId;

  const overrides = await prisma.tenantFeature.findMany({
    where: { tenantId },
    include: { feature: true },
  });

  return NextResponse.json(toSnakeCase(overrides));
});

export const PUT = withSuperAdmin(async (req, ctx) => {
  const tenantId = ctx.params?.tenantId;
  const body = await validateBody(req, updateTenantFeaturesSchema);
  if (isValidationError(body)) return body;

  // Upsert each tenant feature override
  for (const item of body.features) {
    await prisma.tenantFeature.upsert({
      where: {
        tenantId_featureId: {
          tenantId: tenantId!,
          featureId: item.feature_id,
        },
      },
      update: { enabled: item.enabled },
      create: {
        tenantId: tenantId!,
        featureId: item.feature_id,
        enabled: item.enabled,
      },
    });
  }

  const result = await prisma.tenantFeature.findMany({
    where: { tenantId },
    include: { feature: true },
  });

  await logAuditEvent({
    actorType: "platform_admin",
    actorId: ctx.adminId,
    action: "tenant_feature.update",
    targetType: "tenant",
    targetId: tenantId,
    tenantId,
    metadata: { features: body.features },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(toSnakeCase(result));
});
