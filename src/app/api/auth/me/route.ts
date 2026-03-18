import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(null);
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
  });
  if (!user) {
    return NextResponse.json(null);
  }

  const permissions = await prisma.userPermission.findMany({
    where: { userId: user.id, granted: true },
  });

  return NextResponse.json({
    id: user.id,
    username: user.username,
    display_name: user.displayName,
    role: user.role,
    is_active: user.isActive,
    permissions: permissions.map((p) => p.permissionKey),
    created_at: user.createdAt.toISOString(),
    updated_at: user.updatedAt.toISOString(),
  });
}
