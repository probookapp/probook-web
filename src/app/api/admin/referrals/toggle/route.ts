import { NextRequest, NextResponse } from "next/server";
import { withSuperAdmin, logAuditEvent, getClientIp } from "@/lib/admin-api-utils";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";

// Activate / deactivate a referral code. Code creation is tenant-side; admins can only
// enable/disable an existing code.
export const POST = withSuperAdmin(async (req: NextRequest, ctx) => {
  const body = (await req.json().catch(() => ({}))) as { id?: string; is_active?: boolean };
  if (!body.id) {
    return NextResponse.json({ error: "Missing referral code id" }, { status: 400 });
  }

  const existing = await prisma.referralCode.findUnique({ where: { id: body.id } });
  if (!existing) {
    return NextResponse.json({ error: "Referral code not found" }, { status: 404 });
  }

  const isActive = typeof body.is_active === "boolean" ? body.is_active : !existing.isActive;

  const updated = await prisma.referralCode.update({
    where: { id: body.id },
    data: { isActive },
  });

  await logAuditEvent({
    actorType: "platform_admin",
    actorId: ctx.adminId,
    action: "referral_code.toggle",
    targetType: "referral_code",
    targetId: updated.id,
    tenantId: updated.tenantId,
    metadata: { isActive },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(toSnakeCase(updated));
});
