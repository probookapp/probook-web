import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { validateBody, isValidationError } from "@/lib/validate";
import { totpDisableSchema } from "@/lib/validations";

export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const body = await validateBody(req, totpDisableSchema);
  if (isValidationError(body)) return body;
  const { password } = body;

  const user = await prisma.user.findUnique({
    where: { id: ctx.session.userId },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  // Delete TOTP secret and backup codes
  await prisma.totpSecret.deleteMany({
    where: { userId: user.id },
  });
  await prisma.backupCode.deleteMany({
    where: { userId: user.id },
  });

  // Disable TOTP on user
  await prisma.user.update({
    where: { id: user.id },
    data: { totpEnabled: false },
  });

  return NextResponse.json({ success: true });
});
