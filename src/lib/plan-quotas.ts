import { prisma } from "./db";

/**
 * How much of something an offer includes.
 *
 * The other axis of an offer. An entitlement (`feature-keys.ts`) says whether a
 * module exists for this account at all; a quota says how much of it they get.
 * They are not interchangeable, and confusing them makes for a harsher product
 * than intended: "your offer does not include team management" is a different
 * sentence from "your offer covers three people".
 *
 * `PlanQuota` has existed in the schema since the billing model was written,
 * and the admin panel has always been able to fill it in. Nothing read it, so
 * every limit an admin typed was decoration. This reads it.
 */
export const QUOTA_KEYS = {
  /** How many user accounts the tenant may have. */
  MAX_USERS: "max_users",
} as const;

export type QuotaKey = (typeof QUOTA_KEYS)[keyof typeof QUOTA_KEYS];

/** No ceiling — the offer says nothing, or there is no offer to say it. */
export const UNLIMITED = null;

/**
 * The ceiling this tenant's offer sets, or null for none.
 *
 * Unlimited in three cases, all deliberate:
 *  - no active subscription, including during a trial — a trial carries every
 *    module, and metering it would make the evaluation misleading;
 *  - the plan sets no quota for this key;
 *  - anything unexpected. A quota that fails closed would lock a paying
 *    customer out of their own team over a database hiccup.
 *
 * Seats sold on the subscription win over the offer's figure. Without that,
 * selling one extra seat to a business on Commerce means minting a private plan
 * for that one customer — a row in the offer catalogue per hire — and the à la
 * carte composer would mint one per combination on top.
 */
export async function getQuota(
  tenantId: string,
  key: QuotaKey
): Promise<number | null> {
  const subscription = await prisma.subscription.findFirst({
    where: { tenantId, status: "active", currentPeriodEnd: { gt: new Date() } },
    select: { planId: true, seats: true },
  });
  if (!subscription) return UNLIMITED;

  // Only seats are sold per subscription; the other quotas stay plan-level, so
  // this override is scoped to the key it can actually answer.
  if (key === QUOTA_KEYS.MAX_USERS && subscription.seats != null) {
    return subscription.seats;
  }

  const quota = await prisma.planQuota.findUnique({
    where: { planId_quotaKey: { planId: subscription.planId, quotaKey: key } },
    select: { limitValue: true },
  });

  return quota ? quota.limitValue : UNLIMITED;
}

/**
 * What the team screen needs to show a limit before someone fills in a form:
 * the ceiling and how much of it is used.
 */
export async function getUserQuotaUsage(
  tenantId: string
): Promise<{ used: number; limit: number | null }> {
  const [used, limit] = await Promise.all([
    prisma.user.count({ where: { tenantId, isActive: true } }),
    getQuota(tenantId, QUOTA_KEYS.MAX_USERS),
  ]);
  return { used, limit };
}
