import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";
import {
  withSuperAdmin,
  logAuditEvent,
  getClientIp,
} from "@/lib/admin-api-utils";
import { validateBody, isValidationError } from "@/lib/validate";
import { grantTrialSchema } from "@/lib/validations";

// Grant or extend a free trial for a tenant, with an admin-chosen duration.
// If the tenant currently has an active (possibly manually-granted) subscription
// it is cancelled first, so the trial window actually gates access.
export const POST = withSuperAdmin(async (req, ctx) => {
  const id = ctx.params?.id;

  const body = await validateBody(req, grantTrialSchema);
  if (isValidationError(body)) return body;
  const { days } = body;

  const existing = await prisma.tenant.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const now = new Date();

  // Extend from the current trial end only when the tenant is *genuinely* mid
  // trial — i.e. no active subscription overriding it. A tenant that later took
  // a paid plan still carries its original signup trialEndsAt; converting that
  // account to a trial must start fresh from now (admin typed the duration they
  // want), not stack days onto the stale timestamp.
  const activeSub = await prisma.subscription.findFirst({
    where: { tenantId: id, status: "active" },
    select: { id: true },
  });
  const trialRunning = !activeSub && !!existing.trialEndsAt && existing.trialEndsAt > now;
  const base = trialRunning ? existing.trialEndsAt! : now;
  const newTrialEnd = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

  const [tenant, cancelled] = await prisma.$transaction([
    prisma.tenant.update({
      where: { id },
      data: {
        trialStartedAt: existing.trialStartedAt ?? now,
        trialEndsAt: newTrialEnd,
        // Never leave a trial tenant suspended (would block access entirely).
        ...(existing.status === "suspended" ? { status: "active" } : {}),
      },
    }),
    // Cancel any active subscription so /subscription/current falls through to
    // the trial window instead of reporting an active paid plan.
    prisma.subscription.updateMany({
      where: { tenantId: id, status: "active" },
      data: { status: "cancelled", cancelledAt: now },
    }),
  ]);

  await logAuditEvent({
    actorType: "platform_admin",
    actorId: ctx.adminId,
    action: "tenant.grant_trial",
    targetType: "tenant",
    targetId: id,
    tenantId: id,
    metadata: {
      days,
      trialEndsAt: newTrialEnd.toISOString(),
      cancelledActiveSubscriptions: cancelled.count,
      previousStatus: existing.status,
    },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(toSnakeCase(tenant));
});
