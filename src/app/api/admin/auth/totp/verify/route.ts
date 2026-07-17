import { NextRequest, NextResponse } from "next/server";
import {
  createAdminToken,
  setAdminSessionCookie,
  verifyAdminTotpChallengeToken,
  decryptTotpSecret,
  PlatformSessionPayload,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAuditEvent, getClientIp } from "@/lib/admin-api-utils";
import { verifyTOTP } from "@/lib/totp";
import { validateBody, isValidationError } from "@/lib/validate";
import { totpVerifySchema } from "@/lib/validations";

const TOTP_MAX_ATTEMPTS = 5;
const TOTP_WINDOW_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const body = await validateBody(req, totpVerifySchema);
    if (isValidationError(body)) return body;
    const { challenge_token, code } = body;

    // Verify the challenge token — proves the caller completed username+password.
    const adminId = await verifyAdminTotpChallengeToken(challenge_token);
    if (!adminId) {
      return NextResponse.json(
        { error: "Invalid or expired challenge. Please log in again." },
        { status: 401 }
      );
    }

    // Durable rate limit on the TOTP step (per-admin sentinel username).
    const sentinel = `admin_totp_verify:${adminId}`;
    const windowStart = new Date(Date.now() - TOTP_WINDOW_MS);
    const recentFailures = await prisma.adminLoginAttempt.count({
      where: {
        username: sentinel,
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

    const admin = await prisma.platformAdmin.findUnique({ where: { id: adminId } });
    if (!admin || !admin.isActive || !admin.totpEnabled || !admin.totpSecret) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const secret = await decryptTotpSecret(admin.totpSecret);
    const valid = await verifyTOTP(secret, code);

    if (!valid) {
      await prisma.adminLoginAttempt.create({
        data: { username: sentinel, ipAddress: getClientIp(req), success: false },
      });
      return NextResponse.json({ error: "Invalid code" }, { status: 401 });
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
      metadata: { method: "2fa" },
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      id: admin.id,
      username: admin.username,
      display_name: admin.displayName,
      email: admin.email,
      role: admin.role,
    });
  } catch (error) {
    console.error("Admin TOTP verify error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
