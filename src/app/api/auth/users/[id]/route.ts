import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-utils";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { updateUserSchema } from "@/lib/validations";
import { buildPermissionRows, serializeUser } from "../permissions";

export const PUT = withAdmin(async (req, { tenantId, params }) => {
  const id = params?.id;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const body = await validateBody(req, updateUserSchema);
  if (isValidationError(body)) return body;
  const { username, display_name, password, role, is_active, permissions, permission_details } = body;

  const updateData: { username: string; displayName: string; role: string; isActive: boolean; passwordHash?: string } = {
    username,
    displayName: display_name,
    role,
    isActive: is_active,
  };

  if (password) {
    updateData.passwordHash = await hashPassword(password);
  }

  const user = await prisma.user.update({
    where: { id, tenantId },
    data: updateData,
  });

  // Update permissions: replace the full set when either representation is
  // supplied (permission_details is authoritative; permissions is legacy).
  const rows = buildPermissionRows(id, permission_details, permissions);
  if (permission_details !== undefined || permissions !== undefined) {
    await prisma.userPermission.deleteMany({ where: { userId: id } });
    if (rows.length > 0) {
      await prisma.userPermission.createMany({ data: rows });
    }
  }

  const perms = await prisma.userPermission.findMany({
    where: { userId: id },
  });

  return NextResponse.json(serializeUser(user, perms));
});

export const DELETE = withAdmin(async (req, { session, tenantId, params }) => {
  const id = params?.id;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  if (id === session.userId) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
  }

  await prisma.user.delete({ where: { id, tenantId } });
  return new NextResponse(null, { status: 204 });
});
