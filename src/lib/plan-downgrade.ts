import { prisma } from "./db";
import { QUOTA_KEYS } from "./plan-quotas";

/**
 * Whether a business can fit in the offer it is asking to move to.
 *
 * A downgrade is the one plan change that can ask for something impossible: the
 * team already exists. Three ways to handle it were on the table.
 *
 * Keeping the accounts and freezing new ones is the gentlest, and it was the
 * first plan here — until it turned out to destroy the reason to pay. A business
 * on Commerce for three seats drops to Essential, keeps all three, and Essential
 * is simply Commerce minus the modules at half the price. The seat ceiling stops
 * being a ceiling and becomes a suggestion.
 *
 * Deactivating the excess automatically is what Zoho does. It is also how a
 * business loses the account its accountant was using, on a Friday, without
 * anyone deciding which one.
 *
 * So: refuse the move, and say what it would take. That is what monday.com and
 * GitLab do, and it is the only one of the three where the person who knows the
 * team makes the decision about the team. Nobody is deactivated behind their
 * back, and nobody gets a ceiling for free.
 *
 * A plan-level quota cut is deliberately NOT routed through here: lowering
 * Commerce from 3 seats to 2 must never deactivate anyone at businesses that
 * did nothing. They keep what they have and cannot add.
 */
export interface SeatCheck {
  /** Active accounts the business has today. */
  active: number;
  /** What the target offer would allow, null for unlimited. */
  limit: number | null;
  /** How many accounts would have to go before the move is possible. */
  excess: number;
}

/** The seat ceiling a target offer would impose, null for unlimited. */
export async function seatLimitForPlan(
  planId: string,
  seats?: number | null
): Promise<number | null> {
  // Seats sold on the subscription win, exactly as getQuota resolves them, so
  // an admin can approve a downgrade that keeps the team by buying seats.
  if (seats != null) return seats;

  const quota = await prisma.planQuota.findUnique({
    where: { planId_quotaKey: { planId, quotaKey: QUOTA_KEYS.MAX_USERS } },
    select: { limitValue: true },
  });
  return quota ? quota.limitValue : null;
}

/**
 * Null when the move fits. Otherwise what is in the way.
 *
 * Counts active accounts only: deactivated ones cost nothing and occupy no
 * seat, which is what makes "deactivate two, then move" a real answer rather
 * than "delete two people".
 */
export async function checkSeatCeiling(
  tenantId: string,
  planId: string,
  seats?: number | null
): Promise<SeatCheck | null> {
  const limit = await seatLimitForPlan(planId, seats);
  if (limit === null) return null;

  const active = await prisma.user.count({ where: { tenantId, isActive: true } });
  if (active <= limit) return null;

  return { active, limit, excess: active - limit };
}

/**
 * The same check against a bare seat count, for a composed offer that has no
 * plan row yet. Split out rather than passing an empty plan id that happens to
 * be ignored: that only works while `seatLimitForPlan` short-circuits, and the
 * next person to touch it has no way to know they must keep doing so.
 */
export async function checkSeatCount(
  tenantId: string,
  seats: number
): Promise<SeatCheck | null> {
  const active = await prisma.user.count({ where: { tenantId, isActive: true } });
  if (active <= seats) return null;
  return { active, limit: seats, excess: active - seats };
}

/** The refusal, worded so the reader knows what to do next. */
export function seatCeilingError(check: SeatCheck) {
  return {
    error: `This offer covers ${check.limit} user account${check.limit === 1 ? "" : "s"}, and the business has ${check.active} active. Deactivate ${check.excess} before switching, or add seats to the subscription.`,
    code: "SEATS_EXCEEDED" as const,
    active: check.active,
    limit: check.limit,
    excess: check.excess,
  };
}
