import { NextRequest, NextResponse } from "next/server";
import { withPlatformAdmin } from "@/lib/admin-api-utils";
import { clearImpersonationCookie } from "@/lib/auth";

export const POST = withPlatformAdmin(async (_req: NextRequest, _ctx) => {
  await clearImpersonationCookie();
  return NextResponse.json({ success: true });
});
