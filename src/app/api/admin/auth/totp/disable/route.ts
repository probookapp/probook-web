import { NextRequest, NextResponse } from "next/server";
import { withPlatformAdmin, logAuditEvent, getClientIp } from "@/lib/admin-api-utils";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { validateBody, isValidationError } from "@/lib/validate";
import { totpDisableSchema } from "@/lib/validations";

// Disable 2FA for the currently logged-in platform admin (password-confirmed).
export const POST = withPlatformAdmin(async (req: NextRequest, ctx) => {
  const body = await validateBody(req, totpDisableSchema);
  if (isValidationError(body)) return body;
  const { password } = body;

  const admin = await prisma.platformAdmin.findUnique({
    where: { id: ctx.adminId },
  });
  if (!admin) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const valid = await verifyPassword(password, admin.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  await prisma.platformAdmin.update({
    where: { id: admin.id },
    data: { totpEnabled: false, totpSecret: null },
  });
  await prisma.adminBackupCode.deleteMany({ where: { adminId: admin.id } });

  await logAuditEvent({
    actorType: "platform_admin",
    actorId: admin.id,
    action: "admin.totp.disable",
    ipAddress: getClientIp(req),
  });

  return NextResponse.json({ success: true });
});
