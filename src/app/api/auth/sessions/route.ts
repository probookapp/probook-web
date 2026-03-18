import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { getSessionToken, hashToken } from "@/lib/auth";

export const GET = withAuth(async (_req: NextRequest, ctx: AuthContext) => {
  const token = await getSessionToken();
  const currentTokenHash = token ? await hashToken(token) : null;

  const sessions = await prisma.userSession.findMany({
    where: {
      userId: ctx.session.userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { lastActiveAt: "desc" },
  });

  const result = sessions.map((s) => ({
    id: s.id,
    user_agent: s.userAgent,
    ip_address: s.ipAddress,
    last_active_at: s.lastActiveAt.toISOString(),
    created_at: s.createdAt.toISOString(),
    is_current: s.tokenHash === currentTokenHash,
  }));

  return NextResponse.json(result);
});
