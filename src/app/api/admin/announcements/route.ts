import { NextRequest, NextResponse } from "next/server";
import { withPlatformAdmin, withSuperAdmin, logAuditEvent, getClientIp } from "@/lib/admin-api-utils";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";
import { validateBody, isValidationError } from "@/lib/validate";
import { createAnnouncementSchema } from "@/lib/validations";

export const GET = withPlatformAdmin(async (_req, _ctx) => {
  const announcements = await prisma.announcement.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(toSnakeCase(announcements));
});

export const POST = withSuperAdmin(async (req: NextRequest, ctx) => {
  const body = await validateBody(req, createAnnouncementSchema);
  if (isValidationError(body)) return body;

  const announcement = await prisma.announcement.create({
    data: {
      title: body.title,
      body: body.body,
      bodyHtml: body.body_html || null,
      targetType: body.target_type || "all",
      targetId: body.target_id || null,
      publishedAt: body.published_at ? new Date(body.published_at) : null,
      expiresAt: body.expires_at ? new Date(body.expires_at) : null,
      createdBy: ctx.adminId,
    },
  });

  await logAuditEvent({
    actorType: "platform_admin",
    actorId: ctx.adminId,
    action: "announcement.create",
    targetType: "announcement",
    targetId: announcement.id,
    metadata: { title: body.title, targetType: body.target_type },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(toSnakeCase(announcement), { status: 201 });
});
