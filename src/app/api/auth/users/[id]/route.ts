import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-utils";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { updateUserSchema } from "@/lib/validations";
import { buildPermissionRows, serializeUser } from "../permissions";
import { isOwner } from "@/lib/tenant-owner";

export const PUT = withAdmin(async (req, { tenantId, params }) => {
  const id = params?.id;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const body = await validateBody(req, updateUserSchema);
  if (isValidationError(body)) return body;
  const { username, display_name, password, role, is_active, permissions, permission_details } = body;

  // The owner keeps their keys. Demoting or deactivating them is how a business
  // ends up with nobody able to manage it — the account can still be renamed or
  // given a new password, which is everything an owner legitimately needs.
  // To hand the business over, see POST /api/auth/owner.
  if (await isOwner(tenantId, id)) {
    if (role !== "admin") {
      return NextResponse.json(
        {
          error: "The business owner cannot be demoted. Transfer ownership first.",
          code: "OWNER_PROTECTED",
        },
        { status: 400 }
      );
    }
    if (is_active === false) {
      return NextResponse.json(
        {
          error: "The business owner cannot be deactivated. Transfer ownership first.",
          code: "OWNER_PROTECTED",
        },
        { status: 400 }
      );
    }
  }

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

  if (await isOwner(tenantId, id)) {
    return NextResponse.json(
      {
        error: "The business owner cannot be deleted. Transfer ownership first.",
        code: "OWNER_PROTECTED",
      },
      { status: 400 }
    );
  }

  await prisma.user.delete({ where: { id, tenantId } });
  return new NextResponse(null, { status: 204 });
});
