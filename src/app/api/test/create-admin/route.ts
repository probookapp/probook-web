import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { getClientIp } from "@/lib/client-ip";

/**
 * Test-only endpoint to create a platform admin for e2e tests.
 * Available in non-production environments, and in production builds ONLY when
 * E2E_TEST_MODE=1 (set by CI, which runs the e2e suite against a production
 * build). NEVER set E2E_TEST_MODE on a real deployment — this endpoint mints
 * super admins without authentication.
 */
export async function POST(req: NextRequest) {
  const allowed = process.env.NODE_ENV !== "production" || process.env.E2E_TEST_MODE === "1";
  if (!allowed) {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  const { username, email, password } = await req.json();

  if (!username || !email || !password) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Clear this caller's failed-login history before minting the admin.
  //
  // The brute-force lockout matches on IP as well as username (five failures in
  // fifteen minutes), and every test in the suite comes from the same loopback
  // address. Four specs deliberately try bad credentials, so in a full run the
  // lock tripped and every admin test after it failed with a 429 — a suite that
  // passed alone and failed together, differently each time. Clearing it here
  // keeps each test starting from a clean slate, and touches nothing outside
  // this test-only route: the production lockout is unchanged.
  await prisma.adminLoginAttempt.deleteMany({
    where: { ipAddress: getClientIp(req), success: false },
  });

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.platformAdmin.create({
    data: {
      username,
      displayName: username,
      email,
      passwordHash,
      role: "super_admin",
      isActive: true,
    },
  });

  return NextResponse.json({ id: admin.id, username: admin.username });
}
