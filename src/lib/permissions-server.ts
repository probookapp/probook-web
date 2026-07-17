import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth";

export type PermissionAction = "view" | "create" | "edit" | "delete";

/**
 * Server-side action-level permission check. Admins (role "admin") always pass.
 * Employees must have a UserPermission row for the module with the matching
 * can_* flag. A missing row = no access to that module.
 *
 * Existing employees are unaffected: the migration backfilled can_view/create/
 * edit/delete = granted, so any module they already had is fully allowed.
 */
export async function userCan(
  session: SessionPayload,
  key: string,
  action: PermissionAction
): Promise<boolean> {
  if (session.role === "admin") return true;

  const perm = await prisma.userPermission.findUnique({
    where: { userId_permissionKey: { userId: session.userId, permissionKey: key } },
  });
  if (!perm) return false;

  switch (action) {
    case "view":
      return perm.canView;
    case "create":
      return perm.canCreate;
    case "edit":
      return perm.canEdit;
    case "delete":
      return perm.canDelete;
    default:
      return false;
  }
}

export function forbidden(message = "You don't have permission to perform this action") {
  return NextResponse.json({ error: message }, { status: 403 });
}

/**
 * Guard helper for route handlers: returns a 403 NextResponse if the session
 * lacks the permission, otherwise null (proceed).
 *
 *   const denied = await requirePermission(session, "invoices", "edit");
 *   if (denied) return denied;
 */
export async function requirePermission(
  session: SessionPayload,
  key: string,
  action: PermissionAction
): Promise<NextResponse | null> {
  const ok = await userCan(session, key, action);
  return ok ? null : forbidden();
}
