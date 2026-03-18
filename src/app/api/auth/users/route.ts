import { NextResponse } from "next/server";
import { withAuth, withAdmin } from "@/lib/api-utils";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { createUserSchema } from "@/lib/validations";

export const GET = withAuth(async (req, { tenantId }) => {
  const users = await prisma.user.findMany({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });

  const result = await Promise.all(
    users.map(async (u) => {
      const perms = await prisma.userPermission.findMany({
        where: { userId: u.id, granted: true },
      });
      return {
        id: u.id,
        username: u.username,
        display_name: u.displayName,
        role: u.role,
        is_active: u.isActive,
        permissions: perms.map((p) => p.permissionKey),
        created_at: u.createdAt.toISOString(),
        updated_at: u.updatedAt.toISOString(),
      };
    })
  );

  return NextResponse.json(result);
});

export const POST = withAdmin(async (req, { tenantId }) => {
  const body = await validateBody(req, createUserSchema);
  if (isValidationError(body)) return body;
  const { username, display_name, password, role, permissions } = body;

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      tenantId,
      username,
      displayName: display_name,
      passwordHash,
      role: role || "employee",
    },
  });

  if (permissions && Array.isArray(permissions)) {
    await prisma.userPermission.createMany({
      data: permissions.map((key: string) => ({
        userId: user.id,
        permissionKey: key,
        granted: true,
      })),
    });
  }

  const perms = await prisma.userPermission.findMany({
    where: { userId: user.id, granted: true },
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
