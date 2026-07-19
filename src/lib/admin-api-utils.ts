import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getAdminSession, PlatformSessionPayload } from "./auth";
import { prisma } from "./db";
import { getClientIp } from "./client-ip";

// Re-exported so existing call sites importing from this module keep working.
export { getClientIp };

export interface AdminContext {
  session: PlatformSessionPayload;
  adminId: string;
  role: string;
  params?: Record<string, string>;
}

export function withPlatformAdmin(
  handler: (req: NextRequest, ctx: AdminContext) => Promise<NextResponse>
) {
  return async (req: NextRequest, context?: { params?: Promise<Record<string, string>> }) => {
    try {
      const session = await getAdminSession();
      if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      // Verify admin still exists and is active
      const admin = await prisma.platformAdmin.findUnique({
        where: { id: session.userId },
      });
      if (!admin || !admin.isActive) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const params = context?.params ? await context.params : undefined;
      return await handler(req, {
        session,
        adminId: session.userId,
        role: session.role,
        params,
      });
    } catch (error: unknown) {
      console.error("Admin API Error:", error);
      const message = error instanceof Error ? error.message : "Internal server error";
      if (message === "Unauthorized") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (message.includes("Forbidden")) {
        return NextResponse.json({ error: message }, { status: 403 });
      }
      // Report every unexpected 500 once, from this single choke point
      Sentry.captureException(error, {
        tags: { route: new URL(req.url).pathname },
      });
      // Don't leak internal error details to clients (mirrors withAuth)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}

export function withSuperAdmin(
  handler: (req: NextRequest, ctx: AdminContext) => Promise<NextResponse>
) {
  return withPlatformAdmin(async (req, ctx) => {
    if (ctx.role !== "super_admin") {
      return NextResponse.json(
        { error: "Forbidden: super admin access required" },
        { status: 403 }
      );
    }
    return handler(req, ctx);
  });
}

export async function logAuditEvent(params: {
  actorType: "platform_admin" | "user";
  actorId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  tenantId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        actorType: params.actorType,
        actorId: params.actorId,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        tenantId: params.tenantId,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
        ipAddress: params.ipAddress,
      },
    });
  } catch (error) {
    // Never let audit logging failures break the main flow
    console.error("Failed to log audit event:", error);
  }
}

// ========== Durable Admin Login Brute-Force Protection ==========
// Backed by the AdminLoginAttempt table so the lockout survives restarts and is
// shared across serverless instances (the old in-memory Map was per-instance).

const ADMIN_LOGIN_MAX_ATTEMPTS = 5;
const ADMIN_LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Record a single admin login attempt (success or failure) for durable
 * brute-force accounting.
 */
export async function recordAdminLoginAttempt(params: {
  username: string;
  ipAddress?: string;
  success: boolean;
}): Promise<void> {
  try {
    await prisma.adminLoginAttempt.create({
      data: {
        username: params.username,
        ipAddress: params.ipAddress,
        success: params.success,
      },
    });
  } catch (error) {
    // Never let attempt logging break the login flow
    console.error("Failed to record admin login attempt:", error);
  }
}

/**
 * Check whether the given IP address or username is currently locked out due to
 * too many recent failed admin login attempts. Counts failures in the trailing
 * 15-minute window and blocks at the 5-attempt threshold.
 */
export async function checkAdminLoginLock(params: {
  username: string;
  ipAddress?: string;
}): Promise<{ locked: boolean; minutesLeft: number }> {
  const windowStart = new Date(Date.now() - ADMIN_LOGIN_WINDOW_MS);

  // Match on either IP or username so an attacker can't dodge the limit by
  // rotating one while hammering the other.
  const orFilters: Array<Record<string, unknown>> = [{ username: params.username }];
  if (params.ipAddress) orFilters.push({ ipAddress: params.ipAddress });

  const recentFailures = await prisma.adminLoginAttempt.findMany({
    where: {
      success: false,
      createdAt: { gte: windowStart },
      OR: orFilters,
    },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });

  if (recentFailures.length < ADMIN_LOGIN_MAX_ATTEMPTS) {
    return { locked: false, minutesLeft: 0 };
  }

  // Lockout expires 15 minutes after the oldest failure in the window.
  const oldest = recentFailures[0].createdAt.getTime();
  const unlockAt = oldest + ADMIN_LOGIN_WINDOW_MS;
  const minutesLeft = Math.max(1, Math.ceil((unlockAt - Date.now()) / 60000));
  return { locked: true, minutesLeft };
}
