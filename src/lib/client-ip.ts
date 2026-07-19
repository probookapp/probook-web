import { NextRequest } from "next/server";

/**
 * Extract the client IP from platform-set headers.
 *
 * Prefers `x-vercel-forwarded-for`, which Vercel's proxy sets itself and a
 * client cannot spoof, then falls back to the FIRST entry of
 * `x-forwarded-for` (the platform appends the real peer IP; earlier entries
 * are client-supplied, but the first is the original client on Vercel).
 * Returns "unknown" when neither header is present (e.g. plain local dev).
 *
 * Edge-safe: no Node-only imports, usable from middleware and API routes.
 */
export function getClientIp(req: NextRequest): string {
  const vercelForwarded = req.headers.get("x-vercel-forwarded-for");
  if (vercelForwarded) {
    const first = vercelForwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  return "unknown";
}
