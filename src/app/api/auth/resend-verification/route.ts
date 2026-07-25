import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, AuthContext } from "@/lib/api-utils";
import { sendEmail, verificationEmailHtml } from "@/lib/email";
import { issueEmailVerificationToken } from "@/lib/verification";

export const POST = withAuth(async (_req: NextRequest, ctx: AuthContext) => {
  const user = await prisma.user.findUnique({
    where: { id: ctx.session.userId },
  });

  if (!user || !user.email) {
    return NextResponse.json(
      { error: "No email address on account" },
      { status: 400 }
    );
  }

  // Rate limit: only allow if last token was >2 minutes ago
  const lastToken = await prisma.emailVerificationToken.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  if (lastToken) {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    if (lastToken.createdAt > twoMinutesAgo) {
      return NextResponse.json(
        { error: "Please wait before requesting another verification email" },
        { status: 429 }
      );
    }
  }

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
      { error: "Could not send the verification email. Please try again." },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true });
});
