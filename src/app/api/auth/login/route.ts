import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword, createToken, setSessionCookie, hashToken, createTotpChallengeToken } from "@/lib/auth";
import { checkAccountLocked, checkAccountLockedByIp, recordLoginAttempt } from "@/lib/brute-force";
import { validateBody, isValidationError } from "@/lib/validate";
import { loginSchema } from "@/lib/validations";

export async function POST(req: NextRequest) {
  try {
    const body = await validateBody(req, loginSchema);
    if (isValidationError(body)) return body;
    const { username, password } = body;

    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      undefined;

    // Check brute force lockout using IP-based tracking for unknown users
    const lockoutByIp = await checkAccountLockedByIp(ipAddress || "unknown", username);
    if (lockoutByIp.locked) {
      return NextResponse.json(
        { error: `Account temporarily locked. Try again in ${lockoutByIp.minutesLeft} minutes.` },
        { status: 429 }
      );
    }

    const user = await prisma.user.findFirst({
      where: { username, isActive: true },
    });

    if (!user) {
      // Record failed attempt even for non-existent users
      await recordLoginAttempt({
        username,
        tenantId: "unknown",
        ipAddress,
        success: false,
      });
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Check brute force lockout for known user
    const lockout = await checkAccountLocked(user.tenantId, username);
    if (lockout.locked) {
      return NextResponse.json(
        { error: `Account temporarily locked. Try again in ${lockout.minutesLeft} minutes.` },
        { status: 429 }
      );
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      await recordLoginAttempt({
        userId: user.id,
        username,
        tenantId: user.tenantId,
        ipAddress,
        success: false,
      });
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Record successful attempt
    await recordLoginAttempt({
      userId: user.id,
      username,
      tenantId: user.tenantId,
      ipAddress,
      success: true,
    });

    // Check if 2FA is enabled — return a signed challenge token (not raw user_id)
    if (user.totpEnabled) {
      const challengeToken = await createTotpChallengeToken(user.id);
      return NextResponse.json({
        requires_2fa: true,
        challenge_token: challengeToken,
      });
    }

    const token = await createToken({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
    });
    await setSessionCookie(token);

    // Create UserSession record
    const tokenHash = await hashToken(token);
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
    console.error("Login error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Login failed" }, { status: 500 });
  }
}
