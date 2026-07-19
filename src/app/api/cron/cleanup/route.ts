import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/db";

// Daily housekeeping job (vercel.json schedules this at 03:00).
//
// Retention rules:
//   - RateLimitLog: rows older than 30 days are deleted.
//   - PasswordResetToken / EmailVerificationToken / AdminPasswordResetToken:
//     expired rows (expiresAt < now) are deleted — used-but-unexpired rows are
//     kept until they expire.
//   - UserSession: expired rows (expiresAt < now) are deleted outright. An
//     expired session can never authenticate again (the JWT lifetime matches),
//     so keeping a revoked row would only bloat the table.

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const RATE_LIMIT_LOG_RETENTION_DAYS = 30;

// Vercel Cron invokes this with "Authorization: Bearer ${CRON_SECRET}" when
// CRON_SECRET is set. Outside production the check is skipped so the job can
// be exercised locally.
function isAuthorized(req: NextRequest): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

export const GET = async (req: NextRequest) => {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const rateLimitCutoff = new Date(
      now.getTime() - RATE_LIMIT_LOG_RETENTION_DAYS * MS_PER_DAY
    );

    const [
      rateLimitLogs,
      passwordResetTokens,
      emailVerificationTokens,
      adminPasswordResetTokens,
      userSessions,
    ] = await Promise.all([
      prisma.rateLimitLog.deleteMany({
        where: { createdAt: { lt: rateLimitCutoff } },
      }),
      prisma.passwordResetToken.deleteMany({
        where: { expiresAt: { lt: now } },
      }),
      prisma.emailVerificationToken.deleteMany({
        where: { expiresAt: { lt: now } },
      }),
      prisma.adminPasswordResetToken.deleteMany({
        where: { expiresAt: { lt: now } },
      }),
      prisma.userSession.deleteMany({
        where: { expiresAt: { lt: now } },
      }),
    ]);

    return NextResponse.json({
      rate_limit_logs_deleted: rateLimitLogs.count,
      password_reset_tokens_deleted: passwordResetTokens.count,
      email_verification_tokens_deleted: emailVerificationTokens.count,
      admin_password_reset_tokens_deleted: adminPasswordResetTokens.count,
      user_sessions_deleted: userSessions.count,
    });
  } catch (error) {
    console.error("Cron cleanup error:", error);
    Sentry.captureException(error, { tags: { route: "/api/cron/cleanup" } });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
};
