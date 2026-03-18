import { NextResponse } from "next/server";
import { withPlatformAdmin } from "@/lib/admin-api-utils";

export const GET = withPlatformAdmin(async (_req, { adminId }) => {
  const { prisma } = await import("@/lib/db");

  const admin = await prisma.platformAdmin.findUnique({
    where: { id: adminId },
  });

  if (!admin) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: admin.id,
    username: admin.username,
    display_name: admin.displayName,
    email: admin.email,
    role: admin.role,
  });
});
