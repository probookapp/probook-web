import { NextRequest, NextResponse } from "next/server";
import { withPlatformAdmin, logAuditEvent, getClientIp } from "@/lib/admin-api-utils";
import { prisma } from "@/lib/db";
import { decryptTotpSecret, hashPassword } from "@/lib/auth";
import { verifyTOTP, generateBackupCodes } from "@/lib/totp";
import { validateBody, isValidationError } from "@/lib/validate";
import { totpVerifySetupSchema } from "@/lib/validations";

// Confirm enrollment: verify a code against the pending secret, then enable 2FA.
export const POST = withPlatformAdmin(async (req: NextRequest, ctx) => {
  const body = await validateBody(req, totpVerifySetupSchema);
  if (isValidationError(body)) return body;
  const { code } = body;

  const admin = await prisma.platformAdmin.findUnique({
    where: { id: ctx.adminId },
  });
  if (!admin || !admin.totpSecret) {
    return NextResponse.json({ error: "TOTP setup not initiated" }, { status: 400 });
  }

  const secret = await decryptTotpSecret(admin.totpSecret);
  const valid = await verifyTOTP(secret, code);
  if (!valid) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  await prisma.platformAdmin.update({
    where: { id: admin.id },
    data: { totpEnabled: true },
  });

  // Issue one-time recovery codes (shown once) so a lost authenticator doesn't
  // lock the admin out. Replace any previous set.
  const plainCodes = generateBackupCodes(8);
  await prisma.adminBackupCode.deleteMany({ where: { adminId: admin.id } });
  for (const plainCode of plainCodes) {
    await prisma.adminBackupCode.create({
      data: { adminId: admin.id, code: await hashPassword(plainCode) },
    });
  }

  await logAuditEvent({
    actorType: "platform_admin",
    actorId: admin.id,
    action: "admin.totp.enable",
    ipAddress: getClientIp(req),
  });

  return NextResponse.json({ success: true, backup_codes: plainCodes });
});
