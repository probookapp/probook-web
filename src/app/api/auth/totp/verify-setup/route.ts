import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { verifyTOTP, generateBackupCodes } from "@/lib/totp";
import { validateBody, isValidationError } from "@/lib/validate";
import { totpVerifySetupSchema } from "@/lib/validations";

export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const body = await validateBody(req, totpVerifySetupSchema);
  if (isValidationError(body)) return body;
  const { code } = body;

  const totpSecret = await prisma.totpSecret.findUnique({
    where: { userId: ctx.session.userId },
  });

  if (!totpSecret) {
    return NextResponse.json(
      { error: "TOTP setup not initiated" },
      { status: 400 }
    );
  }

  const valid = await verifyTOTP(totpSecret.secret, code);
  if (!valid) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  // Mark as verified and enable TOTP on user
  await prisma.totpSecret.update({
    where: { userId: ctx.session.userId },
    data: { verified: true },
  });

  await prisma.user.update({
    where: { id: ctx.session.userId },
    data: { totpEnabled: true },
  });

  // Generate backup codes
  const plainCodes = generateBackupCodes(8);

  // Delete existing backup codes
  await prisma.backupCode.deleteMany({
    where: { userId: ctx.session.userId },
  });

  // Hash and store backup codes
  for (const plainCode of plainCodes) {
    const hashedCode = await hashPassword(plainCode);
    await prisma.backupCode.create({
      data: {
        userId: ctx.session.userId,
        code: hashedCode,
      },
    });
  }

  return NextResponse.json({ backup_codes: plainCodes });
});
