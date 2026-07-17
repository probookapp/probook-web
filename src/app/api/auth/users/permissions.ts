// Helpers for translating between the DB `UserPermission` rows (which carry
// the four CRUD flags) and the API's snake_case JSON shape.

export interface PermissionDetailInput {
  key: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

interface PermissionRow {
  permissionKey: string;
  granted: boolean;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

interface UserRecord {
  id: string;
  username: string;
  displayName: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Build the `createMany` payload for a user's permissions.
 *
 * - When `details` (per-module CRUD flags) is provided it is authoritative.
 * - Otherwise falls back to the legacy `permissions` string list, where each
 *   listed module grants full access (view/create/edit/delete) — matching the
 *   backfill migration semantics so existing callers keep working.
 * - `granted` is kept in sync with `canView` for backward compatibility.
 */
export function buildPermissionRows(
  userId: string,
  details: PermissionDetailInput[] | undefined,
  permissions: string[] | undefined
): (PermissionRow & { userId: string })[] {
  if (details && details.length > 0) {
    return details.map((d) => ({
      userId,
      permissionKey: d.key,
      granted: d.can_view,
      canView: d.can_view,
      canCreate: d.can_create,
      canEdit: d.can_edit,
      canDelete: d.can_delete,
    }));
  }

  if (permissions && permissions.length > 0) {
    return permissions.map((key) => ({
      userId,
      permissionKey: key,
      granted: true,
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
    }));
  }

  return [];
}

/** Serialize a user + its permission rows into the API response shape. */
export function serializeUser(user: UserRecord, perms: PermissionRow[]) {
  return {
    id: user.id,
    username: user.username,
    display_name: user.displayName,
    role: user.role,
    is_active: user.isActive,
    // Legacy view-only list (module keys the user can see).
    permissions: perms.filter((p) => p.canView).map((p) => p.permissionKey),
    // Full CRUD detail per module.
    permission_details: perms.map((p) => ({
      key: p.permissionKey,
      can_view: p.canView,
      can_create: p.canCreate,
      can_edit: p.canEdit,
      can_delete: p.canDelete,
    })),
    created_at: user.createdAt.toISOString(),
    updated_at: user.updatedAt.toISOString(),
  };
}
