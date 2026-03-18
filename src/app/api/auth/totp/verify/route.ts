import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createToken, setSessionCookie, hashToken, verifyPassword, verifyTotpChallengeToken } from "@/lib/auth";
import { verifyTOTP } from "@/lib/totp";
import { validateBody, isValidationError } from "@/lib/validate";
import { totpVerifySchema } from "@/lib/validations";

const TOTP_MAX_ATTEMPTS = 5;
const TOTP_LOCKOUT_MINUTES = 15;

export async function POST(req: NextRequest) {
  try {
    const body = await validateBody(req, totpVerifySchema);
    if (isValidationError(body)) return body;
    const { challenge_token, code } = body;

    // Verify the challenge token — proves the caller completed username+password auth
    const userId = await verifyTotpChallengeToken(challenge_token);
    if (!userId) {
      return NextResponse.json(
        { error: "Invalid or expired challenge. Please log in again." },
        { status: 401 }
      );
    }

    // Rate limit TOTP attempts using LoginAttempt table
    const windowStart = new Date(Date.now() - TOTP_LOCKOUT_MINUTES * 60 * 1000);
    const recentFailures = await prisma.loginAttempt.count({
      where: {
        userId,
        username: "totp_verify",
        success: false,
        createdAt: { gte: windowStart },
      },
    });

    if (recentFailures >= TOTP_MAX_ATTEMPTS) {
      return NextResponse.json(
        { error: "Too many failed attempts. Please try again later." },
        { status: 429 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId, isActive: true },
    });

    if (!user || !user.totpEnabled) {
      return NextResponse.json(
        { error: "Invalid request" },
        { status: 400 }
      );
    }

    const totpSecret = await prisma.totpSecret.findUnique({
      where: { userId: user.id },
    });

    if (!totpSecret || !totpSecret.verified) {
      return NextResponse.json(
        { error: "TOTP not configured" },
        { status: 400 }
      );
    }

    // Try TOTP code first
    let valid = await verifyTOTP(totpSecret.secret, code);

    // If TOTP didn't match, try backup codes
    if (!valid) {
      const backupCodes = await prisma.backupCode.findMany({
        where: { userId: user.id, usedAt: null },
      });

      for (const bc of backupCodes) {
        const matches = await verifyPassword(code, bc.code);
        if (matches) {
          // Mark backup code as used
          await prisma.backupCode.update({
            where: { id: bc.id },
            data: { usedAt: new Date() },
          });
          valid = true;
          break;
        }
      }
    }

    if (!valid) {
      // Record failed TOTP attempt for rate limiting
      await prisma.loginAttempt.create({
        data: {
          userId: user.id,
          username: "totp_verify",
          tenantId: user.tenantId,
          success: false,
        },
      });
      return NextResponse.json(
        { error: "Invalid code" },
        { status: 401 }
      );
    }

    // Create session
    const token = await createToken({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
    });
    await setSessionCookie(token);

    // Create UserSession record
    const tokenHash = await hashToken(token);
    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      undefined;
    const userAgent = req.headers.get("user-agent") || undefined;

    await prisma.userSession.create({
      data: {
        userId: user.id,
        tokenHash,
        userAgent,
        ipAddress,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const permissions = await prisma.userPermission.findMany({
      where: { userId: user.id, granted: true },
    });

    return NextResponse.json({
      id: user.id,
      username: user.username,
      display_name: user.displayName,
      role: user.role,
      is_active: user.isActive,
      permissions: permissions.map((p) => p.permissionKey),
      created_at: user.createdAt.toISOString(),
      updated_at: user.updatedAt.toISOString(),
    });
  } catch (error: unknown) {
    console.error("TOTP verify error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Verification failed" },
      { status: 500 }
    );
  }
}
