import { NextRequest, NextResponse } from "next/server";
import { withPlatformAdmin, withSuperAdmin, logAuditEvent, getClientIp } from "@/lib/admin-api-utils";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";

const ALLOWED_STATUSES = ["pending", "processing", "completed", "failed"];

export const GET = withPlatformAdmin(async (_req: NextRequest, ctx) => {
  const id = ctx.params?.id;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const dataRequest = await prisma.dataRequest.findUnique({
    where: { id },
    include: {
      tenant: {
        select: { id: true, name: true, slug: true },
      },
    },
  });

  if (!dataRequest) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Never expose filePath here: it holds the full tenant export (base64 data
  // URL). Downloads go through the super-admin-only /download route.
  const { filePath, ...rest } = dataRequest;
  return NextResponse.json(toSnakeCase({ ...rest, hasExport: Boolean(filePath) }));
});

// Update the status of a request (mark processing / completed / failed) and/or notes.
// Note: this does NOT execute a tenant data deletion — that remains a deliberate manual step.
export const PUT = withSuperAdmin(async (req: NextRequest, ctx) => {
  const id = ctx.params?.id;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { status?: string; notes?: string };

  if (body.status && !ALLOWED_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const existing = await prisma.dataRequest.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.dataRequest.update({
    where: { id },
    data: {
      status: body.status ?? existing.status,
      notes: body.notes !== undefined ? body.notes : existing.notes,
      completedAt:
        body.status === "completed"
          ? existing.completedAt ?? new Date()
          : existing.completedAt,
    },
    include: { tenant: { select: { id: true, name: true, slug: true } } },
  });

  await logAuditEvent({
    actorType: "platform_admin",
    actorId: ctx.adminId,
    action: "data_request.update",
    targetType: "data_request",
    targetId: id,
    tenantId: existing.tenantId,
    metadata: { status: updated.status },
    ipAddress: getClientIp(req),
  });

  const { filePath, ...rest } = updated;
  return NextResponse.json(toSnakeCase({ ...rest, hasExport: Boolean(filePath) }));
});
