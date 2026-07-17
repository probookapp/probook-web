import { NextResponse } from "next/server";
import { withAuth, withAdmin } from "@/lib/api-utils";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { createUserSchema } from "@/lib/validations";
import { buildPermissionRows, serializeUser } from "./permissions";

export const GET = withAuth(async (req, { tenantId }) => {
  const users = await prisma.user.findMany({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });

  const result = await Promise.all(
    users.map(async (u) => {
      const perms = await prisma.userPermission.findMany({
        where: { userId: u.id },
      });
      return serializeUser(u, perms);
    })
  );

  return NextResponse.json(result);
});

export const POST = withAdmin(async (req, { tenantId }) => {
  const body = await validateBody(req, createUserSchema);
  if (isValidationError(body)) return body;
  const { username, display_name, password, role, permissions, permission_details } = body;

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

  const rows = buildPermissionRows(user.id, permission_details, permissions);
  if (rows.length > 0) {
    await prisma.userPermission.createMany({ data: rows });
  }

  const perms = await prisma.userPermission.findMany({
    where: { userId: user.id },
  });

  return NextResponse.json(serializeUser(user, perms));
});
