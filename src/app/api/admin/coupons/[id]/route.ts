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
import { updateCouponSchema } from "@/lib/validations";

export const GET = withPlatformAdmin(async (_req, ctx) => {
  const id = ctx.params?.id;
  const coupon = await prisma.coupon.findUnique({
    where: { id },
    include: {
      planRestrictions: {
        include: { plan: { select: { id: true, name: true, slug: true } } },
      },
    },
  });
  if (!coupon) {
    return NextResponse.json({ error: "Coupon not found" }, { status: 404 });
  }
  return NextResponse.json(toSnakeCase(coupon));
});

export const PUT = withSuperAdmin(async (req, ctx) => {
  const id = ctx.params?.id;
  const body = await validateBody(req, updateCouponSchema);
  if (isValidationError(body)) return body;

  const existing = await prisma.coupon.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Coupon not found" }, { status: 404 });
  }

  // If plan_ids is provided, replace all plan restrictions
  const planUpdate = body.plan_ids !== undefined
    ? {
        planRestrictions: {
          deleteMany: {},
          create: (body.plan_ids as string[]).map((planId: string) => ({
            planId,
          })),
        },
      }
    : {};

  const coupon = await prisma.coupon.update({
    where: { id },
    data: {
      code: body.code ?? existing.code,
      discountType: body.discount_type ?? existing.discountType,
      discountValue: body.discount_value ?? existing.discountValue,
      currency: body.currency ?? existing.currency,
      maxUses: body.max_uses !== undefined ? body.max_uses : existing.maxUses,
      expiresAt: body.expires_at !== undefined
        ? (body.expires_at ? new Date(body.expires_at) : null)
        : existing.expiresAt,
      isActive: body.is_active !== undefined ? body.is_active : existing.isActive,
      ...planUpdate,
    },
    include: {
      planRestrictions: {
        include: { plan: { select: { id: true, name: true, slug: true } } },
      },
    },
  });

  await logAuditEvent({
    actorType: "platform_admin",
    actorId: ctx.adminId,
    action: "coupon.update",
    targetType: "coupon",
    targetId: coupon.id,
    metadata: { changes: body },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(toSnakeCase(coupon));
});

export const DELETE = withSuperAdmin(async (req, ctx) => {
  const id = ctx.params?.id;

  const existing = await prisma.coupon.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Coupon not found" }, { status: 404 });
  }

  await prisma.coupon.update({
    where: { id },
    data: { isActive: false },
  });

  await logAuditEvent({
    actorType: "platform_admin",
    actorId: ctx.adminId,
    action: "coupon.delete",
    targetType: "coupon",
    targetId: id,
    metadata: { code: existing.code },
    ipAddress: getClientIp(req),
  });

  return new NextResponse(null, { status: 204 });
});
