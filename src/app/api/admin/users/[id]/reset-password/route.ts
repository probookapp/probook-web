import { NextRequest, NextResponse } from "next/server";
import { withSuperAdmin, logAuditEvent, getClientIp } from "@/lib/admin-api-utils";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { validateBody, isValidationError } from "@/lib/validate";
import { adminResetPasswordSchema } from "@/lib/validations";

export const POST = withSuperAdmin(async (req: NextRequest, ctx) => {
  const id = ctx.params?.id;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const body = await validateBody(req, adminResetPasswordSchema);
  if (isValidationError(body)) return body;
  const { new_password } = body;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const passwordHash = await hashPassword(new_password);

  await prisma.user.update({
    where: { id },
    data: { passwordHash },
  });

  await logAuditEvent({
    actorType: "platform_admin",
    actorId: ctx.adminId,
    action: "user.reset_password",
    targetType: "user",
    targetId: id,
    tenantId: user.tenantId,
    metadata: { username: user.username },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json({ success: true });
});
