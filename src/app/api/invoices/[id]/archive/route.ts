import { withAuth } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions-server";
import { setArchived } from "@/lib/archive-server";

/** Put a document away. DELETE un-archives it — nothing is ever destroyed here. */
export const POST = withAuth(async (req, { session, tenantId, params }) => {
  const denied = await requirePermission(session, "invoices", "edit");
  if (denied) return denied;
  return setArchived("invoice", tenantId, params?.id, true);
});

export const DELETE = withAuth(async (req, { session, tenantId, params }) => {
  const denied = await requirePermission(session, "invoices", "edit");
  if (denied) return denied;
  return setArchived("invoice", tenantId, params?.id, false);
});
