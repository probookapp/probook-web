import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, clearSessionCookie } from "@/lib/auth";
import { validateBody, isValidationError } from "@/lib/validate";
import { resetPasswordSchema } from "@/lib/validations";
import { getClientIp } from "@/lib/client-ip";
import { rateLimitDurable } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    // Durable throttle: 10 attempts per 15 minutes per IP — slows down
    // brute-forcing of reset tokens (Redis-backed in production)
    const rateLimited = await rateLimitDurable("reset-pw", getClientIp(req), {
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });
    if (rateLimited) return rateLimited;

    const body = await validateBody(req, resetPasswordSchema);
    if (isValidationError(body)) return body;
    const { token, password } = body;

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
    });

    if (!resetToken) {
      return NextResponse.json(
        { error: "Invalid or expired reset link" },
        { status: 400 }
      );
    }

    if (resetToken.usedAt) {
      return NextResponse.json(
        { error: "Invalid or expired reset link" },
        { status: 400 }
      );
    }

    if (resetToken.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Invalid or expired reset link" },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(password);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
      // Revoke all existing sessions — forces re-login with new password
      prisma.userSession.updateMany({
        where: { userId: resetToken.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    // Clear the current cookie in case the user is logged in
    await clearSessionCookie();

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Reset password error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
