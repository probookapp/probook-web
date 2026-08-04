import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendEmail, verificationEmailHtml } from "@/lib/email";
import {
  issueEmailVerificationToken,
  throttledResponse,
  verificationResendWait,
} from "@/lib/verification";

/**
 * Unauthenticated resend of a verification email, keyed by an existing (possibly
 * expired) verification token. Verification links are usually opened logged out
 * or in another browser, where the authenticated /resend-verification route
 * 401s — this is the recovery path for an expired link. Responses are
 * deliberately non-committal about whether the token/account exists.
 */
export async function POST(req: NextRequest) {
  const { token } = (await req.json().catch(() => ({}))) as { token?: string };
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Missing token", code: "TOKEN_INVALID" }, { status: 400 });
  }

  const existing = await prisma.emailVerificationToken.findUnique({ where: { token } });
  if (!existing) {
    return NextResponse.json({ success: true });
  }

  const user = await prisma.user.findUnique({ where: { id: existing.userId } });
  if (!user || !user.email || user.emailVerified) {
    return NextResponse.json({ success: true });
  }

  // Same throttle as the authenticated resend route — the signup email counts,
  // so this fires for anyone who clicks "resend" in the first two minutes.
  const wait = await verificationResendWait(user.id);
  if (wait > 0) return throttledResponse(wait);

  const newToken = await issueEmailVerificationToken(user.id, user.email);

  try {
    await sendEmail({
      to: user.email,
      subject: "Verify your email - Probook",
      html: verificationEmailHtml(`${process.env.NEXT_PUBLIC_APP_URL}/verify-email?token=${newToken}`),
    });
  } catch (emailError) {
    console.error("Failed to send verification email:", emailError);
    return NextResponse.json(
      { error: "Could not send the verification email. Please try again.", code: "SEND_FAILED" },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true });
}
