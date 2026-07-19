import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
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

export interface ListPagination {
  limit: number;
  cursor: string | null;
}

/**
 * Opt-in cursor pagination for list GETs (audit SALE-23/ADM-13/POS-18).
 *
 * Returns null when `limit` is absent or unparsable — the caller must then
 * serve the legacy full-array response, byte-for-byte unchanged. When present,
 * `limit` is clamped to 1..200 and `cursor` (an item id) marks the row AFTER
 * which the page starts (keyset via Prisma `cursor` + `skip: 1`).
 */
export function parseListPagination(req: NextRequest): ListPagination | null {
  const params = new URL(req.url).searchParams;
  const rawLimit = params.get("limit");
  if (rawLimit === null) return null;
  const limit = Number.parseInt(rawLimit, 10);
  if (Number.isNaN(limit)) return null;
  const cursor = params.get("cursor");
  return { limit: Math.min(200, Math.max(1, limit)), cursor: cursor || null };
}

/**
 * next_cursor for a keyset page: the last item's id when the page came back
 * full (there may be more rows), else null (definitely the last page).
 */
export function nextCursorOf(items: { id: string }[], limit: number): string | null {
  return items.length === limit ? items[items.length - 1].id : null;
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
    // Hoisted so the catch block can tag Sentry events with the tenant.
    let resolvedTenantId: string | undefined;
    try {
      // Check for impersonation: the signed cookie is honored only for a live
      // super_admin session whose userId matches the cookie's adminId claim.
      // Any other combination ignores the cookie and uses normal session auth.
      const impersonation = await getImpersonationData();
      const adminSession = impersonation ? await getAdminSession() : null;
      const impersonating =
        !!impersonation &&
        !!adminSession &&
        adminSession.role === "super_admin" &&
        adminSession.userId === impersonation.adminId;

      let session: SessionPayload | null;
      let tenantId: string;

      if (impersonating && impersonation) {
        tenantId = impersonation.tenantId;
        // Create a synthetic session for the impersonated tenant
        session = { userId: impersonation.adminId, tenantId, role: "admin" };

        // Verify tenant still exists (handles stale sessions after DB reset).
        // Super_admin impersonation deliberately bypasses the suspended check
        // so platform staff can inspect suspended accounts.
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
        if (!tenant) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
      } else {
        session = await getSession();
        if (!session) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        tenantId = session.tenantId;

        // One query for the session user + their tenant status, with the
        // session-revocation lookup in parallel.
        const rawToken = await getSessionToken();
        const [user, userSession] = await Promise.all([
          prisma.user.findUnique({
            where: { id: session.userId },
            include: { tenant: { select: { status: true } } },
          }),
          rawToken
            ? hashToken(rawToken).then((tokenHash) =>
                prisma.userSession.findUnique({ where: { tokenHash } })
              )
            : Promise.resolve(null),
        ]);

        if (!user || !user.isActive) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (userSession?.revokedAt) {
          return NextResponse.json({ error: "Session revoked" }, { status: 401 });
        }
        if (user.tenant.status === "suspended") {
          return NextResponse.json({ error: "Account suspended" }, { status: 403 });
        }
      }

      resolvedTenantId = tenantId;

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
      // Report every unexpected 500 once, from this single choke point
      Sentry.captureException(error, {
        tags: {
          ...(resolvedTenantId ? { tenantId: resolvedTenantId } : {}),
          route: new URL(req.url).pathname,
        },
      });
      // Don't leak internal error details to clients
      return NextResponse.json(
        { error: "Internal server error" },
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
