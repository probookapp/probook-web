import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-utils";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { updateUserSchema } from "@/lib/validations";

export const PUT = withAdmin(async (req, { tenantId, params }) => {
  const id = params?.id;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const body = await validateBody(req, updateUserSchema);
  if (isValidationError(body)) return body;
  const { username, display_name, password, role, is_active, permissions } = body;

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

  // Update permissions
  if (permissions && Array.isArray(permissions)) {
    await prisma.userPermission.deleteMany({ where: { userId: id } });
    await prisma.userPermission.createMany({
      data: permissions.map((key: string) => ({
        userId: id,
        permissionKey: key,
        granted: true,
      })),
    });
  }

  const perms = await prisma.userPermission.findMany({
    where: { userId: id, granted: true },
  });

  return NextResponse.json({
    id: user.id,
    username: user.username,
    display_name: user.displayName,
    role: user.role,
    is_active: user.isActive,
    permissions: perms.map((p) => p.permissionKey),
    created_at: user.createdAt.toISOString(),
    updated_at: user.updatedAt.toISOString(),
  });
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
