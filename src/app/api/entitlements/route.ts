import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/api-utils";
import { hasFeatureConfigured } from "@/lib/feature-gate";
import { ALL_FEATURE_KEYS, type FeatureKey } from "@/lib/feature-keys";
import { getUserQuotaUsage } from "@/lib/plan-quotas";

/**
 * What this account's offer includes, and where to find what it does not.
 *
 * Without this the restriction only exists on the server, and the only way to
 * meet it is to fill in a form and be refused — which reads as a fault, not as
 * an offer. The screens read this once and show what is not included as an
 * unlit entry naming the offer that carries it.
 *
 * The offer's name comes from the database rather than the interface, so
 * renaming an offer in the admin does not leave the application telling
 * customers about a plan that no longer exists.
 *
 * Same default-allow rule as enforcement: a key nobody has configured comes
 * back included, so shipping a gate changes nothing until a platform admin
 * creates the flag and links it to the offers that carry it.
 */
export interface Entitlement {
  included: boolean;
  /** The cheapest offer that carries it, when this one does not. */
  upgradeTo?: {
    name: string;
    /** Per-locale names, so the rail can say it in the reader's language. */
    nameTranslations: Record<string, string> | null;
    slug: string;
    sortOrder: number;
  };
}

/** How much of a metered thing the offer covers, and how much is used. */
export interface QuotaUsage {
  used: number;
  /** null = no ceiling: no offer (including during a trial), or none set. */
  limit: number | null;
}

export const GET = withAuth(async (_req, { tenantId }) => {
  const entries = await Promise.all(
    ALL_FEATURE_KEYS.map(async (key): Promise<[FeatureKey, Entitlement]> => {
      const included = await hasFeatureConfigured(tenantId, key);
      if (included) return [key, { included: true }];

      // The least expensive active offer that carries it — what a customer
      // would actually have to move to.
      const plan = await prisma.plan.findFirst({
        where: {
          isActive: true,
          features: { some: { feature: { key } } },
        },
        orderBy: [{ sortOrder: "asc" }, { monthlyPrice: "asc" }],
        select: { name: true, nameTranslations: true, slug: true, sortOrder: true },
      });

      return [
        key,
        plan
          ? {
              included: false,
              upgradeTo: {
                ...plan,
                nameTranslations: (plan.nameTranslations as Record<string, string>) ?? null,
              },
            }
          : { included: false },
      ];
    })
  );

  // Quotas ride along: a screen that has to say "your offer covers three
  // people" before the form is filled needs the same round trip that tells it
  // which modules exist.
  const users = await getUserQuotaUsage(tenantId);

  return NextResponse.json({
    ...Object.fromEntries(entries),
    quotas: { max_users: users },
  });
});
