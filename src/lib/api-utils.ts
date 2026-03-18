import { NextRequest, NextResponse } from "next/server";
import { getSession, getAdminSession, getImpersonationData, getSessionToken, hashToken, SessionPayload } from "./auth";
import { prisma } from "./db";
import { checkRateLimit } from "./rate-limiter";

// Throttle lastActiveAt updates: only write if >1 hour since last update
const lastActiveCache = new Map<string, number>();
const LAST_ACTIVE_THROTTLE_MS = 60 * 60 * 1000; // 1 hour

export async function markOnboardingStep(tenantId: string, stepKey: string) {
  try {
    await prisma.onboardingStep.upsert({
      where: { tenantId_stepKey: { tenantId, stepKey } },
      update: {},
      create: { tenantId, stepKey, completed: true, completedAt: new Date() },
    });
  } catch {
    // Non-critical — don't break the main flow
  }
}

export function toSnakeCase<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj.toISOString() as T;
  if (Array.isArray(obj)) return obj.map(toSnakeCase) as T;
  if (typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([key, value]) => [
        key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
        toSnakeCase(value),
      ])
    ) as T;
  }
  return obj;
}

export interface AuthContext {
  session: SessionPayload;
  tenantId: string;
  params?: Record<string, string>;
}

export function withAuth(
  handler: (req: NextRequest, ctx: AuthContext) => Promise<NextResponse>
) {
  return async (req: NextRequest, context?: { params?: Promise<Record<string, string>> }) => {
    try {
      // Check for impersonation: admin with impersonation cookie
      const impersonation = await getImpersonationData();
      let session: SessionPayload | null = null;
      let tenantId: string;

      if (impersonation) {
        // Verify admin session is still valid
        const adminSession = await getAdminSession();
        if (adminSession) {
          tenantId = impersonation.tenantId;
          // Create a synthetic session for the impersonated tenant
          session = { userId: impersonation.adminId, tenantId, role: "admin" };
        } else {
          // Admin session expired, fall back to normal auth
          session = await getSession();
          if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
          }
          tenantId = session.tenantId;
        }
      } else {
        session = await getSession();
        if (!session) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        tenantId = session.tenantId;
      }

      // Verify tenant still exists (handles stale sessions after DB reset)
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      // Check if session has been revoked
      if (!impersonation) {
        const rawToken = await getSessionToken();
        if (rawToken) {
          const tokenHash = await hashToken(rawToken);
          const userSession = await prisma.userSession.findFirst({
            where: { tokenHash },
          });
          if (userSession?.revokedAt) {
            return NextResponse.json({ error: "Session revoked" }, { status: 401 });
          }
        }
      }

      // Rate limiting
      const endpoint = new URL(req.url).pathname;
      const allowed = await checkRateLimit(tenantId, endpoint);
      if (!allowed) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 });
      }

      // Throttled lastActiveAt update
      const now = Date.now();
      const lastUpdate = lastActiveCache.get(tenantId) ?? 0;
      if (now - lastUpdate > LAST_ACTIVE_THROTTLE_MS) {
        lastActiveCache.set(tenantId, now);
        prisma.tenant.update({
          where: { id: tenantId },
          data: { lastActiveAt: new Date() },
        }).catch(() => { /* non-critical */ });
      }

      const params = context?.params ? await context.params : undefined;
      return await handler(req, { session, tenantId, params });
    } catch (error: unknown) {
      console.error("API Error:", error);
      const message = error instanceof Error ? error.message : "Internal server error";
      if (message === "Unauthorized") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (message.includes("Forbidden")) {
        return NextResponse.json({ error: message }, { status: 403 });
      }
      return NextResponse.json(
        { error: message },
        { status: 500 }
      );
    }
  };
}

export function withAdmin(
  handler: (req: NextRequest, ctx: AuthContext) => Promise<NextResponse>
) {
  return withAuth(async (req, ctx) => {
    if (ctx.session.role !== "admin") {
      return NextResponse.json({ error: "Forbidden: admin access required" }, { status: 403 });
    }
    return handler(req, ctx);
  });
}
