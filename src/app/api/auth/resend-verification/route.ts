import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, AuthContext } from "@/lib/api-utils";
import { sendEmail, verificationEmailHtml } from "@/lib/email";
import {
  issueEmailVerificationToken,
  throttledResponse,
  verificationResendWait,
} from "@/lib/verification";

export const POST = withAuth(async (_req: NextRequest, ctx: AuthContext) => {
  const user = await prisma.user.findUnique({
    where: { id: ctx.session.userId },
  });

  if (!user || !user.email) {
    return NextResponse.json(
      { error: "No email address on account", code: "NO_EMAIL" },
      { status: 400 }
    );
  }

  if (user.emailVerified) {
    return NextResponse.json({ success: true, already_verified: true });
  }

  const wait = await verificationResendWait(user.id);
  if (wait > 0) return throttledResponse(wait);

  // Create new verification token (invalidates prior unused ones).
  const token = await issueEmailVerificationToken(user.id, user.email);
  try {
    await sendEmail({
      to: user.email,
      subject: "Verify your email - Probook",
      html: verificationEmailHtml(`${process.env.NEXT_PUBLIC_APP_URL}/verify-email?token=${token}`),
    });
  } catch (emailError) {
    console.error("Failed to send verification email:", emailError);
    return NextResponse.json(
      { error: "Could not send the verification email. Please try again.", code: "SEND_FAILED" },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true });
});
