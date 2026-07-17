import { NextRequest, NextResponse } from "next/server";
import { withSuperAdmin, logAuditEvent, getClientIp } from "@/lib/admin-api-utils";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";

// Execute a GDPR "deletion" data request: permanently delete the tenant and all
// its data (cascades), then mark the request completed. Destructive and
// irreversible — super-admin only, and the UI requires typed-name confirmation.
export const POST = withSuperAdmin(async (req: NextRequest, ctx) => {
  const id = ctx.params?.id;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const request = await prisma.dataRequest.findUnique({
    where: { id },
    include: { tenant: { select: { id: true, name: true } } },
  });

  if (!request) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (request.requestType !== "deletion") {
    return NextResponse.json({ error: "Only deletion requests can be executed" }, { status: 400 });
  }
  if (request.status === "completed") {
    return NextResponse.json({ error: "Request already completed" }, { status: 400 });
  }

  const tenantName = request.tenant?.name ?? null;

  // Delete the tenant (schema cascades remove all owned business data).
  await prisma.tenant.delete({ where: { id: request.tenantId } });

  // The data_request row itself is cascade-deleted with the tenant, so we log
  // the completion to the audit trail rather than updating the (now-gone) row.
  await logAuditEvent({
    actorType: "platform_admin",
    actorId: ctx.adminId,
    action: "data_request.execute_deletion",
    targetType: "tenant",
    targetId: request.tenantId,
    metadata: { dataRequestId: id, tenantName },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(toSnakeCase({ success: true, tenant_id: request.tenantId }));
});
