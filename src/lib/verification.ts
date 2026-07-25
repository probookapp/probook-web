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
