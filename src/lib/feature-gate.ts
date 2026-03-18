import { prisma } from "./db";

/**
 * Check if a tenant has access to a feature.
 * Check order:
 * 1) TenantFeature override (explicit enable/disable per tenant)
 * 2) FeatureFlag.isGlobal (globally enabled for all tenants)
 * 3) PlanFeature link from active subscription (feature included in tenant's plan)
 */
export async function hasFeature(
  tenantId: string,
  featureKey: string
): Promise<boolean> {
  // Find the feature flag by key
  const feature = await prisma.featureFlag.findUnique({
    where: { key: featureKey },
  });

  if (!feature) {
    return false;
  }

  // 1) Check tenant-specific override
  const tenantOverride = await prisma.tenantFeature.findUnique({
    where: {
      tenantId_featureId: {
        tenantId,
        featureId: feature.id,
      },
    },
  });

  if (tenantOverride) {
    return tenantOverride.enabled;
  }

  // 2) Check if feature is globally enabled
  if (feature.isGlobal) {
    return true;
  }

  // 3) Check if feature is linked to tenant's active subscription plan
  const activeSubscription = await prisma.subscription.findFirst({
    where: {
      tenantId,
      status: "active",
    },
    select: { planId: true },
  });

  if (!activeSubscription) {
    return false;
  }

  const planFeature = await prisma.planFeature.findUnique({
    where: {
      planId_featureId: {
        planId: activeSubscription.planId,
        featureId: feature.id,
      },
    },
  });

  return !!planFeature;
}
