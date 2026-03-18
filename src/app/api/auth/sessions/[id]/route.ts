import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export const DELETE = withAuth(async (_req: NextRequest, ctx: AuthContext) => {
  const sessionId = ctx.params?.id;

  if (!sessionId) {
    return NextResponse.json({ error: "Session ID required" }, { status: 400 });
  }

  // Verify the session belongs to this user
  const session = await prisma.userSession.findFirst({
    where: {
      id: sessionId,
      userId: ctx.session.userId,
    },
  });

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  await prisma.userSession.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });

  return NextResponse.json({ success: true });
});
