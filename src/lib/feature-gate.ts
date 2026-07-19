import { NextResponse } from "next/server";
import type { FeatureFlag } from "@/generated/prisma/client";
import { prisma } from "./db";

/**
 * Feature entitlements (plan gating).
 *
 * HOW TO GATE A ROUTE
 * -------------------
 * Inside a withAuth handler, after the permission check:
 *
 *   const featureDenied = await requireFeature(tenantId, "multi_location");
 *   if (featureDenied) return featureDenied;
 *
 * Resolution order (default-allow):
 *   1. No FeatureFlag row with that key  -> ALLOW (nothing configured yet).
 *   2. TenantFeature override            -> its `enabled` value wins.
 *   3. FeatureFlag.isGlobal              -> ALLOW for every tenant.
 *   4. Otherwise plan-gated              -> ALLOW only if the tenant's active
 *      subscription's plan links the feature (PlanFeature), else DENY.
 *
 * Because no flags ship seeded and new flags default to isGlobal = true,
 * gating a route in code is a no-op until a platform admin creates the flag,
 * unchecks "global", and links it to the paying plans — flipping a restriction
 * on later is admin-UI config, not a code change.
 *
 * Currently gated keys:
 *   - "multi_location": POST /api/locations, POST /api/stock-transfers
 *
 * No cross-request caching (deliberate for now): each call runs at most four
 * small indexed queries. Gated routes call requireFeature once per request; if
 * a route ever needs the same check twice, hoist the result into a local.
 */

/** Steps 2-4 of the resolution order, for an existing FeatureFlag row. */
async function resolveFeatureAccess(
  tenantId: string,
  feature: FeatureFlag
): Promise<boolean> {
  // 2) Tenant-specific override always wins
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

  // 3) Globally enabled flags allow every tenant
  if (feature.isGlobal) {
    return true;
  }

  // 4) Plan-gated: allowed only if the active subscription's plan links it
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

/**
 * Strict check: does the tenant have this feature? Unlike requireFeature, an
 * unknown key returns false (useful for "is this configured AND on" queries,
 * e.g. admin UI display). Not the enforcement path — routes use requireFeature.
 */
export async function hasFeature(
  tenantId: string,
  featureKey: string
): Promise<boolean> {
  const feature = await prisma.featureFlag.findUnique({
    where: { key: featureKey },
  });

  if (!feature) {
    return false;
  }

  return resolveFeatureAccess(tenantId, feature);
}

/**
 * Enforcement guard for route handlers, mirroring requirePermission: returns a
 * 403 NextResponse when the tenant is denied the feature, otherwise null
 * (proceed). Default-allow — see the resolution order above.
 */
export async function requireFeature(
  tenantId: string,
  featureKey: string
): Promise<NextResponse | null> {
  const feature = await prisma.featureFlag.findUnique({
    where: { key: featureKey },
  });

  // 1) Default-allow: an unconfigured key never blocks anyone.
  if (!feature) {
    return null;
  }

  const allowed = await resolveFeatureAccess(tenantId, feature);
  return allowed
    ? null
    : NextResponse.json(
        { error: "This feature is not available on your plan" },
        { status: 403 }
      );
}
