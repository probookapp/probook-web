import type { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";

/**
 * The only thing standing in front of a scheduled job.
 *
 * The middleware lets `/api/cron/*` past the session check, because Vercel Cron
 * sends a bearer and no cookie (see src/proxy.ts). That makes this function the
 * whole guard, so it lives in one place rather than being re-implemented in
 * each job.
 *
 * A production deployment with no `CRON_SECRET` fails closed — but silently,
 * which is how the scheduler came to be broken for so long without anyone
 * noticing. Refusing loudly is the point: the report is the only way anyone
 * finds out the jobs are not running.
 */
export function isCronAuthorized(req: NextRequest, job: string): boolean {
  // Outside production the check is skipped so the job can be exercised locally
  // and by the end-to-end suite.
  if (process.env.NODE_ENV !== "production") return true;

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    const message = `CRON_SECRET is not set: the scheduled job ${job} cannot run.`;
    console.error(message);
    Sentry.captureMessage(message, "error");
    return false;
  }

  return req.headers.get("authorization") === `Bearer ${secret}`;
}
