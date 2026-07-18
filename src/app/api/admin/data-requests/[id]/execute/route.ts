import { NextRequest, NextResponse } from "next/server";
import { withSuperAdmin, getClientIp } from "@/lib/admin-api-utils";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";

// Execute a GDPR "deletion" data request: permanently delete the tenant and all
// its data (cascades), then mark the request completed. Destructive and
// irreversible — super-admin only, gated on the request being in its reviewed
// ("processing") state, and requires re-typing the exact tenant name.
export const POST = withSuperAdmin(async (req: NextRequest, ctx) => {
  const id = ctx.params?.id;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { confirm_tenant_name?: string };

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
  // The request lifecycle uses pending/processing/completed/failed (no
  // dedicated "approved" status); "processing" is the reviewed, in-progress
  // state, so only requests in that state may be executed.
  if (request.status !== "processing") {
    return NextResponse.json(
      { error: "Only requests in \"processing\" status can be executed" },
      { status: 400 }
    );
  }

  const tenantName = request.tenant?.name ?? null;

  // Server-side typed-name confirmation: the exact tenant name must be echoed
  // back before anything is deleted.
  if (!tenantName || body.confirm_tenant_name !== tenantName) {
    return NextResponse.json(
      { error: "confirm_tenant_name must exactly match the tenant name" },
      { status: 400 }
    );
  }

  // Delete the tenant (schema cascades remove all owned business data) and
  // write the audit event atomically. The data_request row itself is
  // cascade-deleted with the tenant, so we log the completion to the audit
  // trail rather than updating the (now-gone) row.
  await prisma.$transaction(async (tx) => {
    await tx.tenant.delete({ where: { id: request.tenantId } });

    await tx.auditLog.create({
      data: {
        actorType: "platform_admin",
        actorId: ctx.adminId,
        action: "data_request.execute_deletion",
        targetType: "tenant",
        targetId: request.tenantId,
        metadata: JSON.stringify({ dataRequestId: id, tenantName }),
        ipAddress: getClientIp(req),
      },
    });
  });

  return NextResponse.json(toSnakeCase({ success: true, tenant_id: request.tenantId }));
});
