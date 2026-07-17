import { NextRequest, NextResponse } from "next/server";
import {
  verifyPassword,
  createAdminToken,
  setAdminSessionCookie,
  createAdminTotpChallengeToken,
  PlatformSessionPayload,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  logAuditEvent,
  getClientIp,
  recordAdminLoginAttempt,
  checkAdminLoginLock,
} from "@/lib/admin-api-utils";
import { validateBody, isValidationError } from "@/lib/validate";
import { adminLoginSchema } from "@/lib/validations";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);

    const body = await validateBody(req, adminLoginSchema);
    if (isValidationError(body)) return body;
    const { username, password } = body;

    // Durable brute-force lockout (AdminLoginAttempt table)
    const lockStatus = await checkAdminLoginLock({ username, ipAddress: ip });
    if (lockStatus.locked) {
      return NextResponse.json(
        { error: `Too many failed attempts. Try again in ${lockStatus.minutesLeft} minute(s).` },
        { status: 429 }
      );
    }

    const admin = await prisma.platformAdmin.findUnique({
      where: { username },
    });

    if (!admin || !admin.isActive) {
      await recordAdminLoginAttempt({ username, ipAddress: ip, success: false });
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const validPassword = await verifyPassword(password, admin.passwordHash);
    if (!validPassword) {
      await recordAdminLoginAttempt({ username, ipAddress: ip, success: false });
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Password OK — count this as a successful attempt so it clears the window.
    await recordAdminLoginAttempt({ username, ipAddress: ip, success: true });

    // If 2FA is enabled, require a second step. Return a signed challenge token
    // (not the raw admin id) proving step 1 was completed.
    if (admin.totpEnabled && admin.totpSecret) {
      const challengeToken = await createAdminTotpChallengeToken(admin.id);
      return NextResponse.json({
        requires_2fa: true,
        challenge_token: challengeToken,
      });
    }

    const payload: PlatformSessionPayload = {
      userId: admin.id,
      tenantId: null,
      role: admin.role,
      isPlatformAdmin: true,
    };

    const token = await createAdminToken(payload);
    await setAdminSessionCookie(token);

    await logAuditEvent({
      actorType: "platform_admin",
      actorId: admin.id,
      action: "admin.login",
      ipAddress: ip,
    });

    return NextResponse.json({
      id: admin.id,
      username: admin.username,
      display_name: admin.displayName,
      email: admin.email,
      role: admin.role,
    });
  } catch (error) {
    console.error("Admin login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
