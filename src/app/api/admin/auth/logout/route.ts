import { NextResponse } from "next/server";
import { clearAdminSessionCookie, clearImpersonationCookie } from "@/lib/auth";

export async function POST() {
  await clearAdminSessionCookie();
  await clearImpersonationCookie();
  return NextResponse.json({ success: true });
}
