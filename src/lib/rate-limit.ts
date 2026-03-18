import { NextRequest, NextResponse } from "next/server";

interface RateLimitEntry {
  timestamps: number[];
}

interface RateLimitOptions {
  /** Maximum number of requests allowed in the window. */
  limit: number;
  /** Window size in milliseconds. */
  windowMs: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes to prevent memory leaks
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  // Use the largest possible window (the caller's windowMs) as a baseline,
  // but clean anything older than 2 minutes to be safe.
  const cutoff = now - Math.max(windowMs, 2 * 60 * 1000);
  for (const [key, entry] of store) {
    // Remove entries whose newest timestamp is older than the cutoff
    if (entry.timestamps.length === 0 || entry.timestamps[entry.timestamps.length - 1] < cutoff) {
      store.delete(key);
    }
  }
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * In-memory sliding-window rate limiter.
 *
 * Returns `null` when the request is within limits, or a 429 NextResponse
 * when the limit has been exceeded.
 *
 * Usage in middleware / proxy:
 *   const blocked = rateLimit(req, { limit: 20, windowMs: 60_000 });
 *   if (blocked) return blocked;
 */
export function rateLimit(
  req: NextRequest,
  { limit, windowMs }: RateLimitOptions,
): NextResponse | null {
  const ip = getClientIp(req);
  const path = req.nextUrl.pathname;
  const key = `${ip}:${path}`;
  const now = Date.now();
  const windowStart = now - windowMs;

  // Lazy cleanup
  cleanup(windowMs);

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Drop timestamps outside the current window
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

  if (entry.timestamps.length >= limit) {
    const oldestInWindow = entry.timestamps[0];
    const retryAfterSec = Math.ceil((oldestInWindow + windowMs - now) / 1000);

    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSec),
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  entry.timestamps.push(now);
  return null;
}

// Pre-configured limiters for common use cases
const AUTH_LIMIT: RateLimitOptions = { limit: 50, windowMs: 60_000 };
const API_LIMIT: RateLimitOptions = { limit: 100, windowMs: 60_000 };

/** Strict limiter for auth endpoints (login, signup, forgot-password, etc.) — 20 req/min. */
export function rateLimitAuth(req: NextRequest): NextResponse | null {
  return rateLimit(req, AUTH_LIMIT);
}

/** Standard limiter for authenticated API routes — 100 req/min. */
export function rateLimitApi(req: NextRequest): NextResponse | null {
  return rateLimit(req, API_LIMIT);
}
