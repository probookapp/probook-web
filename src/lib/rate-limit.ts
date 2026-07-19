import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { getClientIp } from "./client-ip";

export interface RateLimitOptions {
  /** Maximum number of requests allowed in the window. */
  limit: number;
  /** Window size in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  /** Whether this request is within the limit. */
  allowed: boolean;
  /** Requests counted in the current window, including this one (0 when failing open). */
  count: number;
  /** Start of the current fixed window (epoch ms). */
  windowStart: number;
  /** Seconds until the current window resets. */
  retryAfterSec: number;
}

// ---------------------------------------------------------------------------
// Backend selection
//
// When UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are set, counters
// live in Upstash Redis (REST-based, edge-safe) and are shared across all
// serverless instances — a durable limit. When unset (local dev, CI, tests),
// we fall back to a per-instance in-memory Map, preserving the previous
// behavior.
// ---------------------------------------------------------------------------

let redis: Redis | null | undefined;

function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  redis =
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
      ? Redis.fromEnv()
      : null;
  return redis;
}

// In-memory fallback: fixed-window counters keyed like the Redis keys.
const memoryCounts = new Map<string, { count: number; expiresAt: number }>();
const CLEANUP_INTERVAL_MS = 5 * 60_000; // 5 minutes
const MAX_ENTRIES = 10_000; // safety cap
let lastCleanup = Date.now();

function memoryCleanup(now: number) {
  for (const [key, entry] of memoryCounts) {
    if (entry.expiresAt <= now) {
      memoryCounts.delete(key);
    }
  }
  lastCleanup = now;
}

// Log Redis failures once per instance, not once per request.
let redisErrorLogged = false;

/**
 * Shared fixed-window rate limiter core.
 *
 * Atomically counts a hit against `rl:{scope}:{id}:{windowStart}` and reports
 * whether the request is within `limit`. With Redis configured the counter is
 * shared across instances (INCR + PEXPIRE in a single pipeline, so concurrent
 * requests can't race the window); otherwise it is per-instance in memory.
 *
 * Fails OPEN on Redis errors — availability over strictness.
 */
export async function consumeRateLimit(
  scope: string,
  id: string,
  { limit, windowMs }: RateLimitOptions,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const key = `rl:${scope}:${id}:${windowStart}`;
  const retryAfterSec = Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000));

  const client = getRedis();
  if (client) {
    try {
      const [count] = await client
        .pipeline()
        .incr(key)
        // Per-window key: the TTL only bounds key lifetime, not the window,
        // so refreshing it on every hit is harmless.
        .pexpire(key, windowMs + 1000)
        .exec<[number, number]>();
      return { allowed: count <= limit, count, windowStart, retryAfterSec };
    } catch (error) {
      if (!redisErrorLogged) {
        redisErrorLogged = true;
        console.error("Rate limit Redis error, failing open:", error);
      }
      return { allowed: true, count: 0, windowStart, retryAfterSec };
    }
  }

  // In-memory fallback (per instance)
  if (now - lastCleanup >= CLEANUP_INTERVAL_MS || memoryCounts.size > MAX_ENTRIES) {
    memoryCleanup(now);
  }

  const entry = memoryCounts.get(key);
  if (!entry || entry.expiresAt <= now) {
    memoryCounts.set(key, { count: 1, expiresAt: windowStart + windowMs });
    return { allowed: limit >= 1, count: 1, windowStart, retryAfterSec };
  }

  entry.count += 1;
  return { allowed: entry.count <= limit, count: entry.count, windowStart, retryAfterSec };
}

function tooManyRequests(limit: number, retryAfterSec: number): NextResponse {
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

/**
 * IP+path keyed rate limiter for the edge middleware.
 *
 * Returns `null` when the request is within limits, or a 429 NextResponse
 * when the limit has been exceeded.
 *
 * Usage in middleware / proxy:
 *   const blocked = await rateLimit(req, { limit: 20, windowMs: 60_000 });
 *   if (blocked) return blocked;
 */
export async function rateLimit(
  req: NextRequest,
  options: RateLimitOptions,
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const path = req.nextUrl.pathname;
  const result = await consumeRateLimit("mw", `${ip}:${path}`, options);
  if (result.allowed) return null;
  return tooManyRequests(options.limit, result.retryAfterSec);
}

/**
 * Durable per-key limiter for sensitive endpoints (signup, password reset…).
 *
 * Only enforced when Upstash Redis is configured: without a shared store a
 * per-instance counter gives no real protection on serverless, and skipping
 * keeps local dev / CI / test behavior unchanged (these routes had no
 * per-route limit before).
 *
 * Returns a generic 429 response when over the limit, `null` otherwise.
 */
export async function rateLimitDurable(
  scope: string,
  id: string,
  options: RateLimitOptions,
): Promise<NextResponse | null> {
  if (!getRedis()) return null;
  const result = await consumeRateLimit(scope, id, options);
  if (result.allowed) return null;
  return tooManyRequests(options.limit, result.retryAfterSec);
}

// Pre-configured limiters for common use cases
const AUTH_LIMIT: RateLimitOptions = { limit: 50, windowMs: 60_000 };
const API_LIMIT: RateLimitOptions = { limit: 100, windowMs: 60_000 };

/** Strict limiter for auth endpoints (login, signup, forgot-password, etc.) — 50 req/min. */
export function rateLimitAuth(req: NextRequest): Promise<NextResponse | null> {
  return rateLimit(req, AUTH_LIMIT);
}

/** Standard limiter for authenticated API routes — 100 req/min. */
export function rateLimitApi(req: NextRequest): Promise<NextResponse | null> {
  return rateLimit(req, API_LIMIT);
}
