import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { generateSecret, getTotpUri } from "@/lib/totp";

export const POST = withAuth(async (_req: NextRequest, ctx: AuthContext) => {
  const user = await prisma.user.findUnique({
    where: { id: ctx.session.userId },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const secret = generateSecret();
  const uri = getTotpUri(secret, user.username);

  // Upsert the TOTP secret (not yet verified)
  await prisma.totpSecret.upsert({
    where: { userId: user.id },
    update: { secret, verified: false },
    create: { userId: user.id, secret, verified: false },
  });

  return NextResponse.json({ secret, uri });
});
