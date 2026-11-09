import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { serializeUserInfo } from "@/lib/user-info";

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
    where: { userId: user.id },
  });

  return NextResponse.json(serializeUserInfo(user, permissions));
}
