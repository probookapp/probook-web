import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";
import {
  withPlatformAdmin,
  withSuperAdmin,
  logAuditEvent,
  getClientIp,
} from "@/lib/admin-api-utils";
import { validateBody, isValidationError } from "@/lib/validate";
import { updateTenantSchema } from "@/lib/validations";

export const GET = withPlatformAdmin(async (_req, ctx) => {
  const id = ctx.params?.id;
  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      users: {
        select: {
          id: true,
          username: true,
          displayName: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
      },
      subscriptions: {
        include: { plan: true },
        orderBy: { createdAt: "desc" },
      },
      subscriptionRequests: {
        orderBy: { createdAt: "desc" },
      },
      companySettings: true,
      onboardingSteps: true,
      _count: {
        select: { users: true },
      },
    },
  });
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }
  return NextResponse.json(toSnakeCase(tenant));
});

export const PUT = withSuperAdmin(async (req, ctx) => {
  const id = ctx.params?.id;
  const body = await validateBody(req, updateTenantSchema);
  if (isValidationError(body)) return body;

  const existing = await prisma.tenant.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const tenant = await prisma.tenant.update({
    where: { id },
    data: {
      name: body.name ?? existing.name,
      slug: body.slug ?? existing.slug,
    },
  });

  await logAuditEvent({
    actorType: "platform_admin",
    actorId: ctx.adminId,
    action: "tenant.update",
    targetType: "tenant",
    targetId: tenant.id,
    tenantId: tenant.id,
    metadata: { changes: body },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(toSnakeCase(tenant));
});

export const DELETE = withSuperAdmin(async (req, ctx) => {
  const id = ctx.params?.id;

  const existing = await prisma.tenant.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  await prisma.tenant.delete({ where: { id } });

  await logAuditEvent({
    actorType: "platform_admin",
    actorId: ctx.adminId,
    action: "tenant.delete",
    targetType: "tenant",
    targetId: id,
    metadata: { name: existing.name, slug: existing.slug },
    ipAddress: getClientIp(req),
  });

  return new NextResponse(null, { status: 204 });
});
