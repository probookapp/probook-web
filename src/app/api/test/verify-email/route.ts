import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/api-utils";

/**
 * Test-only endpoint: mark the current tenant user's email as verified.
 *
 * Subscription requests are gated on a verified email, so e2e flows that seed
 * an active subscription need to clear that gate without a real inbox. Same
 * availability guard as /api/test/create-admin — non-production, or production
 * builds with E2E_TEST_MODE=1 (CI only). NEVER enable on a real deployment.
 */
export const POST = withAuth(async (_req: NextRequest, ctx) => {
  const allowed =
    process.env.NODE_ENV !== "production" || process.env.E2E_TEST_MODE === "1";
  if (!allowed) {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  await prisma.user.update({
    where: { id: ctx.session.userId },
    data: { emailVerified: true },
  });

  return NextResponse.json({ success: true });
});
