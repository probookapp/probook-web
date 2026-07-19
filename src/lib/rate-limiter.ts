import { prisma } from "./db";
import { consumeRateLimit } from "./rate-limit";

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 100;

/**
 * Per-tenant, per-endpoint rate limit used by withAuth.
 *
 * Counting is delegated to the shared limiter core in rate-limit.ts (Upstash
 * Redis when configured, per-instance memory otherwise). Breaches are flagged
 * in the RateLimitLog table for the admin rate-limits dashboard.
 */
export async function checkRateLimit(tenantId: string, endpoint: string): Promise<boolean> {
  const result = await consumeRateLimit("api", `${tenantId}:${endpoint}`, {
    limit: MAX_REQUESTS,
    windowMs: WINDOW_MS,
  });

  if (result.allowed) return true;

  // Log flagged rate limit to DB
  try {
    await prisma.rateLimitLog.create({
      data: {
        tenantId,
        endpoint,
        count: result.count,
        windowStart: new Date(result.windowStart),
        flagged: true,
      },
    });
  } catch (error) {
    console.error("Failed to log rate limit:", error);
  }

  return false;
}
