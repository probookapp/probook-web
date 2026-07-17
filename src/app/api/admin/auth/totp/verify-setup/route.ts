import { NextRequest, NextResponse } from "next/server";
import { withPlatformAdmin, logAuditEvent, getClientIp } from "@/lib/admin-api-utils";
import { prisma } from "@/lib/db";
import { decryptTotpSecret } from "@/lib/auth";
import { verifyTOTP } from "@/lib/totp";
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

  await logAuditEvent({
    actorType: "platform_admin",
    actorId: admin.id,
    action: "admin.totp.enable",
    ipAddress: getClientIp(req),
  });

  return NextResponse.json({ success: true });
});
