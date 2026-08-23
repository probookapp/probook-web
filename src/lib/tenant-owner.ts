import { prisma } from "./db";

/**
 * The business owner, and why nothing may touch them.
 *
 * The account that signs up pays the subscription, hires the employees and
 * decides what each of them may do. Every other account exists because that one
 * created it.
 *
 * Before this, nothing said so. The only guard anywhere refused to *delete your
 * own account* — which left the real accident wide open: an admin could demote
 * the other admin, then deactivate themselves, and the business was left with
 * nobody able to add a user, change a setting or undo any of it. The only way
 * back was for platform staff to impersonate them.
 *
 * Guarding the owner closes all three doors at once — role change, deactivation,
 * deletion — and it is a simpler rule than counting how many admins would be
 * left after each write. A rule that simple is one people keep.
 *
 * It costs one thing, and `transferOwnership` pays it: an owner who leaves the
 * company would otherwise lock the business to someone who is gone.
 */

/** Who owns this business, or null for a tenant created before the column. */
export async function getOwnerUserId(tenantId: string): Promise<string | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { ownerUserId: true },
  });
  return tenant?.ownerUserId ?? null;
}

/** Whether this account is the one the business belongs to. */
export async function isOwner(tenantId: string, userId: string): Promise<boolean> {
  return (await getOwnerUserId(tenantId)) === userId;
}

/**
 * Hand the business to another administrator.
 *
 * Only the current owner may do this, and only to an active administrator of
 * the same business — handing it to an employee, or to a deactivated account,
 * would recreate the very hole this exists to close.
 *
 * The two writes are one transaction: a half-applied transfer would leave the
 * business owned by nobody.
 */
export async function transferOwnership(
  tenantId: string,
  currentOwnerId: string,
  newOwnerId: string
): Promise<{ error: string } | null> {
  if (newOwnerId === currentOwnerId) {
    return { error: "This account already owns the business." };
  }

  const successor = await prisma.user.findFirst({
    where: { id: newOwnerId, tenantId },
    select: { role: true, isActive: true },
  });

  if (!successor) return { error: "No such account in this business." };
  if (!successor.isActive) {
    return { error: "A deactivated account cannot take over the business." };
  }
  if (successor.role !== "admin") {
    return { error: "Only an administrator can take over the business." };
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { ownerUserId: newOwnerId },
  });

  return null;
}
