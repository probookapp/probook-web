import { NextRequest, NextResponse } from "next/server";
import { withPlatformAdmin, logAuditEvent, getClientIp } from "@/lib/admin-api-utils";
import { clearImpersonationCookie, getImpersonationData } from "@/lib/auth";

export const POST = withPlatformAdmin(async (req: NextRequest, ctx) => {
  // Read the (signed) cookie before clearing so the audit trail records which
  // tenant the impersonation session was for.
  const impersonation = await getImpersonationData();
  await clearImpersonationCookie();

  if (impersonation) {
    await logAuditEvent({
      actorType: "platform_admin",
      actorId: ctx.adminId,
      action: "tenant.impersonate_stop",
      targetType: "tenant",
      targetId: impersonation.tenantId,
      tenantId: impersonation.tenantId,
      ipAddress: getClientIp(req),
    });
  }

  return NextResponse.json({ success: true });
});
