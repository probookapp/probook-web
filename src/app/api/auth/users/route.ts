import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-utils";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { createUserSchema } from "@/lib/validations";
import { buildPermissionRows, serializeUser } from "./permissions";
import { getUserQuotaUsage } from "@/lib/plan-quotas";
import { getOwnerUserId } from "@/lib/tenant-owner";

// Admin-only: the roster and every user's permission set are management data,
// consistent with the admin-gated POST/PUT/DELETE on this resource (audit TEN-2).
export const GET = withAdmin(async (req, { tenantId }) => {
  const users = await prisma.user.findMany({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });
  const ownerUserId = await getOwnerUserId(tenantId);

  const result = await Promise.all(
    users.map(async (u) => {
      const perms = await prisma.userPermission.findMany({
        where: { userId: u.id },
      });
      return serializeUser(u, perms, u.id === ownerUserId);
    })
  );

  return NextResponse.json(result);
});

export const POST = withAdmin(async (req, { tenantId }) => {
  const body = await validateBody(req, createUserSchema);
  if (isValidationError(body)) return body;

  // The offer's ceiling, checked before anything is written. Existing accounts
  // are never touched when a business moves to a smaller offer — the same rule
  // the entitlement gate follows: what you already have stays, you cannot add
  // to it. Deactivated users do not count, so freeing a seat is possible
  // without deleting anyone's history.
  const { used, limit } = await getUserQuotaUsage(tenantId);
  if (limit !== null && used >= limit) {
    return NextResponse.json(
      {
        error: `Your plan covers ${limit} user account(s). Deactivate one, or move to a larger plan.`,
        code: "USER_QUOTA_REACHED",
        limit,
        used,
      },
      { status: 403 }
    );
  }
  const { username, display_name, password, role, permissions, permission_details } = body;

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      tenantId,
      username,
      displayName: display_name,
      passwordHash,
      role: role || "employee",
    },
  });

  const rows = buildPermissionRows(user.id, permission_details, permissions);
  if (rows.length > 0) {
    await prisma.userPermission.createMany({ data: rows });
  }

  const perms = await prisma.userPermission.findMany({
    where: { userId: user.id },
  });

  return NextResponse.json(serializeUser(user, perms));
});
