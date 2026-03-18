import { NextRequest, NextResponse } from "next/server";
import {
  verifyPassword,
  createAdminToken,
  setAdminSessionCookie,
  PlatformSessionPayload,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAuditEvent, getClientIp } from "@/lib/admin-api-utils";
import { validateBody, isValidationError } from "@/lib/validate";
import { adminLoginSchema } from "@/lib/validations";

// In-memory brute-force protection for admin login
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const failedAttempts = new Map<string, { count: number; firstAttempt: number }>();

function checkAdminLoginLock(ip: string): { locked: boolean; minutesLeft: number } {
  const entry = failedAttempts.get(ip);
  if (!entry) return { locked: false, minutesLeft: 0 };
  if (Date.now() - entry.firstAttempt > LOCKOUT_MS) {
    failedAttempts.delete(ip);
    return { locked: false, minutesLeft: 0 };
  }
  if (entry.count >= MAX_ATTEMPTS) {
    const minutesLeft = Math.ceil((LOCKOUT_MS - (Date.now() - entry.firstAttempt)) / 60000);
    return { locked: true, minutesLeft: Math.max(1, minutesLeft) };
  }
  return { locked: false, minutesLeft: 0 };
}

function recordAdminLoginFailure(ip: string) {
  const entry = failedAttempts.get(ip);
  if (!entry || Date.now() - entry.firstAttempt > LOCKOUT_MS) {
    failedAttempts.set(ip, { count: 1, firstAttempt: Date.now() });
  } else {
    entry.count++;
  }
}

function clearAdminLoginFailures(ip: string) {
  failedAttempts.delete(ip);
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req) || "unknown";

    const lockStatus = checkAdminLoginLock(ip);
    if (lockStatus.locked) {
      return NextResponse.json(
        { error: `Too many failed attempts. Try again in ${lockStatus.minutesLeft} minute(s).` },
        { status: 429 }
      );
    }

    const body = await validateBody(req, adminLoginSchema);
    if (isValidationError(body)) return body;
    const { username, password } = body;

    const admin = await prisma.platformAdmin.findUnique({
      where: { username },
    });

    if (!admin || !admin.isActive) {
      recordAdminLoginFailure(ip);
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const validPassword = await verifyPassword(password, admin.passwordHash);
    if (!validPassword) {
      recordAdminLoginFailure(ip);
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    clearAdminLoginFailures(ip);

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
    console.error("Admin login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
