import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

/**
 * Test-only endpoint to create a platform admin for e2e tests.
 * Only available in non-production environments.
 */
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  const { username, email, password } = await req.json();

  if (!username || !email || !password) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

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
