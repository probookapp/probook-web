import { NextRequest, NextResponse } from "next/server";
import { withPlatformAdmin, withSuperAdmin, logAuditEvent, getClientIp } from "@/lib/admin-api-utils";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";
import { validateBody, isValidationError } from "@/lib/validate";
import { updateAnnouncementSchema } from "@/lib/validations";

export const GET = withPlatformAdmin(async (_req, ctx) => {
  const id = ctx.params?.id;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const announcement = await prisma.announcement.findUnique({
    where: { id },
    include: { dismissals: true },
  });

  if (!announcement) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(toSnakeCase(announcement));
});

export const PUT = withSuperAdmin(async (req: NextRequest, ctx) => {
  const id = ctx.params?.id;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const body = await validateBody(req, updateAnnouncementSchema);
  if (isValidationError(body)) return body;

  const announcement = await prisma.announcement.update({
    where: { id },
    data: {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.body !== undefined && { body: body.body }),
      ...(body.body_html !== undefined && { bodyHtml: body.body_html }),
      ...(body.target_type !== undefined && { targetType: body.target_type }),
      ...(body.target_id !== undefined && { targetId: body.target_id }),
      ...(body.published_at !== undefined && {
        publishedAt: body.published_at ? new Date(body.published_at) : null,
      }),
      ...(body.expires_at !== undefined && {
        expiresAt: body.expires_at ? new Date(body.expires_at) : null,
      }),
    },
  });

  await logAuditEvent({
    actorType: "platform_admin",
    actorId: ctx.adminId,
    action: "announcement.update",
    targetType: "announcement",
    targetId: id,
    metadata: { title: announcement.title },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(toSnakeCase(announcement));
});

export const DELETE = withSuperAdmin(async (req: NextRequest, ctx) => {
  const id = ctx.params?.id;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  await prisma.announcement.delete({ where: { id } });

  await logAuditEvent({
    actorType: "platform_admin",
    actorId: ctx.adminId,
    action: "announcement.delete",
    targetType: "announcement",
    targetId: id,
    ipAddress: getClientIp(req),
  });

  return new NextResponse(null, { status: 204 });
});
