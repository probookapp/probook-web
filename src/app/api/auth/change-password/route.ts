import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-utils";
import { hashPassword, verifyPassword } from "@/lib/auth";
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

  return new NextResponse(null, { status: 204 });
});
