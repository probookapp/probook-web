import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { randomUUID } from "crypto";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Issue a fresh email-verification token for a user, invalidating any prior
 * unused tokens so only the newest link works. Without this, several concurrently
 * valid links could exist and an old one could re-verify a stale address.
 */
export async function issueEmailVerificationToken(
  userId: string,
  email: string
): Promise<string> {
  const token = randomUUID();
  await prisma.$transaction([
    prisma.emailVerificationToken.deleteMany({ where: { userId, usedAt: null } }),
    prisma.emailVerificationToken.create({
      data: { userId, token, email, expiresAt: new Date(Date.now() + TOKEN_TTL_MS) },
    }),
  ]);
  return token;
}

/** Minimum spacing between verification emails for one user. */
export const RESEND_THROTTLE_MS = 2 * 60 * 1000;

/**
 * Seconds the user must wait before another verification email may be sent, or
 * 0 if they may send now. The signup email counts against this window, so the
 * resend button is throttled for the first two minutes of every new account —
 * callers must surface the wait rather than report a send failure.
 */
export async function verificationResendWait(userId: string): Promise<number> {
  const last = await prisma.emailVerificationToken.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (!last) return 0;
  const elapsed = Date.now() - last.createdAt.getTime();
  if (elapsed >= RESEND_THROTTLE_MS) return 0;
  return Math.ceil((RESEND_THROTTLE_MS - elapsed) / 1000);
}

/** 429 response shape shared by both resend routes. */
export function throttledResponse(retryAfter: number) {
  return NextResponse.json(
    {
      error: "Please wait before requesting another verification email",
      code: "THROTTLED",
      retry_after: retryAfter,
    },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}

/**
 * True if a *different* user already has this email verified. Email is the
 * ownership signal the subscribe gate and password reset rely on, so at most one
 * account may hold a given verified address (checked case-insensitively).
 */
export async function isEmailTakenByVerifiedUser(
  email: string,
  exceptUserId?: string
): Promise<boolean> {
  const existing = await prisma.user.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
      emailVerified: true,
      ...(exceptUserId ? { id: { not: exceptUserId } } : {}),
    },
    select: { id: true },
  });
  return !!existing;
}
