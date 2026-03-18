import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { getSessionToken, hashToken } from "@/lib/auth";

export const POST = withAuth(async (_req: NextRequest, ctx: AuthContext) => {
  const token = await getSessionToken();
  const currentTokenHash = token ? await hashToken(token) : null;

  // Revoke all sessions except current
  await prisma.userSession.updateMany({
    where: {
      userId: ctx.session.userId,
      revokedAt: null,
      ...(currentTokenHash ? { tokenHash: { not: currentTokenHash } } : {}),
    },
    data: { revokedAt: new Date() },
  });

  return NextResponse.json({ success: true });
});
