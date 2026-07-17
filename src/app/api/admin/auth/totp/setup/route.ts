import { NextRequest, NextResponse } from "next/server";
import { withPlatformAdmin } from "@/lib/admin-api-utils";
import { prisma } from "@/lib/db";
import { generateSecret, getTotpUri } from "@/lib/totp";
import { encryptTotpSecret } from "@/lib/auth";

// Begin TOTP enrollment for the currently logged-in platform admin.
// Generates a fresh secret, stores it encrypted (not yet enabled), and returns
// the otpauth URI + manual key for an authenticator app.
export const POST = withPlatformAdmin(async (_req: NextRequest, ctx) => {
  const admin = await prisma.platformAdmin.findUnique({
    where: { id: ctx.adminId },
  });
  if (!admin) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const secret = generateSecret();
  const uri = getTotpUri(secret, admin.username, "Probook Admin");
  const encrypted = await encryptTotpSecret(secret);

  // Store the pending secret but keep totpEnabled false until verified.
  await prisma.platformAdmin.update({
    where: { id: admin.id },
    data: { totpSecret: encrypted, totpEnabled: false },
  });

  return NextResponse.json({ secret, uri });
});
