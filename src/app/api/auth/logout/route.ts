import { NextResponse } from "next/server";
import { clearSessionCookie, getSessionToken, hashToken } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST() {
  // Revoke the session in the database before clearing the cookie
  const rawToken = await getSessionToken();
  if (rawToken) {
    const tokenHash = await hashToken(rawToken);
    await prisma.userSession.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  await clearSessionCookie();
  return new NextResponse(null, { status: 200 });
}
