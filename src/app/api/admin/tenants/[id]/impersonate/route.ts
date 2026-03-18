import { NextRequest, NextResponse } from "next/server";
import { withSuperAdmin, logAuditEvent, getClientIp } from "@/lib/admin-api-utils";
import { prisma } from "@/lib/db";
import { setImpersonationCookie } from "@/lib/auth";

export const POST = withSuperAdmin(async (req: NextRequest, ctx) => {
  const tenantId = ctx.params?.id;
  if (!tenantId) {
    return NextResponse.json({ error: "Missing tenant id" }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, status: true },
  });

  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  await setImpersonationCookie(tenantId, ctx.adminId);

  await logAuditEvent({
    actorType: "platform_admin",
    actorId: ctx.adminId,
    action: "tenant.impersonate",
    targetType: "tenant",
    targetId: tenantId,
    tenantId,
    metadata: { tenantName: tenant.name },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json({ success: true, tenant_id: tenantId });
});
