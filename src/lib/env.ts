import { z } from "zod";

// ========== Environment Validation (OPS-7) ==========
// Server-only — never import this from client components.
//
// Validation is lazy: nothing runs at import time, so `next build` and tests
// where some vars are absent keep working. The first call to assertEnv()
// (wired into src/instrumentation.ts, i.e. server startup) validates once:
// - in production it throws an aggregated error listing every bad/missing var,
//   so a misconfigured deploy fails loudly at boot;
// - in development/test (and during the production build phase) it only warns.

// An optional variable set to "" means unset. .env.test blanks the production
// Sentry DSN that way, so `next dev` cannot pick it up from .env — and a blank
// value must not then be reported as invalid.
const optional = () => z.preprocess((v) => (v === "" ? undefined : v), z.string().min(1).optional());

const envSchema = z.object({
  // Required in production
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_URL: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().min(1),

  // Optional
  DIRECT_URL: optional(),
  TOTP_ENCRYPTION_KEY: optional(),
  INVOICE_INTEGRITY_SECRET: optional(),
  UPSTASH_REDIS_REST_URL: optional(),
  UPSTASH_REDIS_REST_TOKEN: optional(),
  CRON_SECRET: optional(),
  NEXT_PUBLIC_SENTRY_DSN: optional(),
  SENTRY_ORG: optional(),
  SENTRY_PROJECT: optional(),
  SENTRY_AUTH_TOKEN: optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

function validate(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (parsed.success) {
    return parsed.data;
  }

  const problems = parsed.error.issues.map(
    (issue) => `${issue.path.join(".")}: ${issue.message}`
  );
  const message =
    `Invalid or missing environment variables:\n  - ${problems.join("\n  - ")}`;

  // `next build` runs with NODE_ENV=production but may not have runtime
  // secrets — never fail the build itself, only the running server.
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
  if (process.env.NODE_ENV === "production" && !isBuildPhase) {
    throw new Error(message);
  }

  console.warn(`[env] ${message}`);
  // Best-effort in development/test so the app keeps running with warnings.
  return process.env as unknown as Env;
}

/**
 * Validate process.env once. Throws in production (outside the build phase)
 * with an aggregated list of every missing/invalid variable; warns otherwise.
 * Called from src/instrumentation.ts so a bad prod deploy fails at boot.
 */
export function assertEnv(): Env {
  if (!cached) {
    cached = validate();
  }
  return cached;
}
