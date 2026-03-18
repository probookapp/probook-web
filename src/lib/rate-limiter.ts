import { prisma } from "./db";

const windowCounts = new Map<string, { count: number; windowStart: number }>();
const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 100;
const CLEANUP_INTERVAL_MS = 5 * 60_000; // 5 minutes
const MAX_ENTRIES = 10_000; // safety cap

let lastCleanup = Date.now();

function cleanup(now: number) {
  for (const [key, entry] of windowCounts) {
    if (now - entry.windowStart >= WINDOW_MS) {
      windowCounts.delete(key);
    }
  }
  lastCleanup = now;
}

export async function checkRateLimit(tenantId: string, endpoint: string): Promise<boolean> {
  const key = `${tenantId}:${endpoint}`;
  const now = Date.now();

  // Periodic cleanup of expired entries to prevent memory leaks
  if (now - lastCleanup >= CLEANUP_INTERVAL_MS || windowCounts.size > MAX_ENTRIES) {
    cleanup(now);
  }

  const entry = windowCounts.get(key);

  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    // New window
    windowCounts.set(key, { count: 1, windowStart: now });
    return true;
  }

  // Within current window
  entry.count += 1;

  if (entry.count > MAX_REQUESTS) {
    // Log flagged rate limit to DB
    try {
      await prisma.rateLimitLog.create({
        data: {
          tenantId,
          endpoint,
          count: entry.count,
          windowStart: new Date(entry.windowStart),
          flagged: true,
        },
      });
    } catch (error) {
      console.error("Failed to log rate limit:", error);
    }
    return false;
  }

  return true;
}
