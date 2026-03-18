import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";
import { withSuperAdmin, logAuditEvent, getClientIp } from "@/lib/admin-api-utils";

export const POST = withSuperAdmin(async (req: NextRequest, ctx) => {
  const id = ctx.params?.id;
  if (!id) {
    return NextResponse.json({ error: "Missing request ID" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({})) as { admin_notes?: string };
  const adminNotes = body.admin_notes || null;

  const request = await prisma.subscriptionRequest.findUnique({
    where: { id },
  });

  if (!request) {
    return NextResponse.json({ error: "Subscription request not found" }, { status: 404 });
  }

  if (request.status !== "pending") {
    return NextResponse.json({ error: "Request has already been reviewed" }, { status: 400 });
  }

  const now = new Date();

  const updatedRequest = await prisma.subscriptionRequest.update({
    where: { id },
    data: {
      status: "rejected",
      reviewedBy: ctx.adminId,
      reviewedAt: now,
      adminNotes,
    },
  });

  await logAuditEvent({
    actorType: "platform_admin",
    actorId: ctx.adminId,
    action: "subscription_request.reject",
    targetType: "subscription_request",
    targetId: id,
    tenantId: request.tenantId,
    metadata: { adminNotes },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(toSnakeCase(updatedRequest));
});
