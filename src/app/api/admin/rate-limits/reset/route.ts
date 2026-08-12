import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withSuperAdmin, logAuditEvent, getClientIp } from "@/lib/admin-api-utils";

/**
 * Clear the flagged rate-limit history for one tenant.
 *
 * The page could only ever show that a tenant had been throttled; there was no
 * way to acknowledge it, so the list grew forever and stale entries looked like
 * live incidents. This unflags the rows rather than deleting them, keeping the
 * raw log for forensics.
 */
export const POST = withSuperAdmin(async (req: NextRequest, ctx) => {
  const body = (await req.json().catch(() => ({}))) as { tenant_id?: string };
  const tenantId = body.tenant_id;

  if (!tenantId) {
    return NextResponse.json({ error: "tenant_id is required" }, { status: 400 });
  }

  const cleared = await prisma.rateLimitLog.updateMany({
    where: { tenantId, flagged: true },
    data: { flagged: false },
  });

  await logAuditEvent({
    actorType: "platform_admin",
    actorId: ctx.adminId,
    action: "rate_limit.clear",
    targetType: "tenant",
    targetId: tenantId,
    tenantId,
    metadata: { clearedRows: cleared.count },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json({ cleared: cleared.count });
});
