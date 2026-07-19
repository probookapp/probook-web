import { NextRequest, NextResponse } from "next/server";
import { withPlatformAdmin, withSuperAdmin, logAuditEvent, getClientIp } from "@/lib/admin-api-utils";
import { prisma } from "@/lib/db";
import { toSnakeCase, parseListPagination, nextCursorOf } from "@/lib/api-utils";

function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return `REF-${out}`;
}

export const GET = withPlatformAdmin(async (req: NextRequest, _ctx) => {
  const include = {
    tenant: {
      select: {
        id: true,
        name: true,
        slug: true,
      },
    },
    referrals: {
      select: {
        id: true,
        referredTenantId: true,
        status: true,
        convertedAt: true,
        createdAt: true,
      },
    },
  } as const;

  const project = <T extends { id: string; tenantId: string; code: string; isActive: boolean; createdAt: Date; tenant: unknown; referrals: Array<{ status: string; [k: string]: unknown }> }>(referralCodes: T[]) =>
    referralCodes.map((rc) => ({
      id: rc.id,
      tenantId: rc.tenantId,
      code: rc.code,
      isActive: rc.isActive,
      createdAt: rc.createdAt,
      tenant: rc.tenant,
      referralsCount: rc.referrals.length,
      convertedCount: rc.referrals.filter((r) => r.status === "converted").length,
      referrals: rc.referrals,
    }));

  // Opt-in cursor pagination (audit ADM-13): same projection (code scalars +
  // tenant reference + per-code referral rows/counts), keyset order.
  const page = parseListPagination(req);
  if (page) {
    const cursorId = page.cursor
      ? (await prisma.referralCode.findUnique({
          where: { id: page.cursor },
          select: { id: true },
        }))?.id ?? null
      : null;
    const referralCodes = await prisma.referralCode.findMany({
      include,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: page.limit,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    });
    return NextResponse.json(
      toSnakeCase({
        data: project(referralCodes),
        nextCursor: nextCursorOf(referralCodes, page.limit),
      })
    );
  }

  const referralCodes = await prisma.referralCode.findMany({
    include,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(toSnakeCase(project(referralCodes)));
});

// Create a referral code for a tenant that does not yet have one.
export const POST = withSuperAdmin(async (req: NextRequest, ctx) => {
  const body = (await req.json().catch(() => ({}))) as { tenant_id?: string; code?: string };
  if (!body.tenant_id) {
    return NextResponse.json({ error: "Missing tenant_id" }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: body.tenant_id } });
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const existing = await prisma.referralCode.findUnique({ where: { tenantId: body.tenant_id } });
  if (existing) {
    return NextResponse.json({ error: "Tenant already has a referral code" }, { status: 409 });
  }

  // Use the provided code or generate a unique one.
  let code = (body.code || "").trim().toUpperCase();
  if (code) {
    const clash = await prisma.referralCode.findUnique({ where: { code } });
    if (clash) {
      return NextResponse.json({ error: "Referral code already in use" }, { status: 409 });
    }
  } else {
    do {
      code = generateReferralCode();
    } while (await prisma.referralCode.findUnique({ where: { code } }));
  }

  const created = await prisma.referralCode.create({
    data: { tenantId: body.tenant_id, code, isActive: true },
  });

  await logAuditEvent({
    actorType: "platform_admin",
    actorId: ctx.adminId,
    action: "referral_code.create",
    targetType: "referral_code",
    targetId: created.id,
    tenantId: body.tenant_id,
    metadata: { code },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(toSnakeCase(created), { status: 201 });
});
