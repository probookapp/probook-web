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
import { createCouponSchema } from "@/lib/validations";

export const GET = withPlatformAdmin(async () => {
  const coupons = await prisma.coupon.findMany({
    include: {
      planRestrictions: {
        include: { plan: { select: { id: true, name: true, slug: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(toSnakeCase(coupons));
});

export const POST = withSuperAdmin(async (req, ctx) => {
  const body = await validateBody(req, createCouponSchema);
  if (isValidationError(body)) return body;

  const coupon = await prisma.coupon.create({
    data: {
      code: body.code,
      discountType: body.discount_type,
      discountValue: body.discount_value,
      currency: body.currency || "DZD",
      maxUses: body.max_uses ?? null,
      expiresAt: body.expires_at ? new Date(body.expires_at) : null,
      isActive: body.is_active ?? true,
      planRestrictions: body.plan_ids?.length
        ? {
            create: body.plan_ids.map((planId: string) => ({
              planId,
            })),
          }
        : undefined,
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
    action: "coupon.create",
    targetType: "coupon",
    targetId: coupon.id,
    metadata: { code: coupon.code, discountType: coupon.discountType },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(toSnakeCase(coupon), { status: 201 });
});
