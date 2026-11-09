import { parseToursCompleted } from "./tours";

interface UserRow {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  emailVerified: boolean;
  role: string;
  isActive: boolean;
  toursCompleted: unknown;
  createdAt: Date;
  updatedAt: Date;
}

interface PermissionRow {
  permissionKey: string;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

/**
 * The signed-in person as the client sees it (UserInfo).
 *
 * One serializer for every route that hands a user to the browser — login,
 * two-factor login, signup and /me. They used to build it each on their own and
 * had drifted: the two-factor login left out the email and the per-action
 * permissions, so whoever signed in with a code saw a different account until
 * the next reload.
 */
export function serializeUserInfo(user: UserRow, permissions: PermissionRow[]) {
  return {
    id: user.id,
    username: user.username,
    display_name: user.displayName,
    email: user.email,
    email_verified: user.emailVerified,
    role: user.role,
    is_active: user.isActive,
    permissions: permissions.filter((p) => p.canView).map((p) => p.permissionKey),
    permission_details: permissions.map((p) => ({
      key: p.permissionKey,
      can_view: p.canView,
      can_create: p.canCreate,
      can_edit: p.canEdit,
      can_delete: p.canDelete,
    })),
    tours_completed: parseToursCompleted(user.toursCompleted),
    created_at: user.createdAt.toISOString(),
    updated_at: user.updatedAt.toISOString(),
  };
}
