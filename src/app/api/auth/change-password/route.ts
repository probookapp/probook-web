import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-utils";
import { hashPassword, verifyPassword, getSessionToken, hashToken } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { changePasswordSchema } from "@/lib/validations";

export const POST = withAuth(async (req, { session }) => {
  const body = await validateBody(req, changePasswordSchema);
  if (isValidationError(body)) return body;
  const { current_password, new_password } = body;

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const valid = await verifyPassword(current_password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  }

  const passwordHash = await hashPassword(new_password);
  await prisma.user.update({
    where: { id: session.userId },
    data: { passwordHash },
  });

  // Revoke every other session — the current one (matched by token hash)
  // stays logged in
  const rawToken = await getSessionToken();
  const currentTokenHash = rawToken ? await hashToken(rawToken) : null;
  await prisma.userSession.updateMany({
    where: {
      userId: session.userId,
      revokedAt: null,
      ...(currentTokenHash ? { tokenHash: { not: currentTokenHash } } : {}),
    },
    data: { revokedAt: new Date() },
  });

  return new NextResponse(null, { status: 204 });
});
