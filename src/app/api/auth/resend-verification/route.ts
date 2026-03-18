import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, AuthContext } from "@/lib/api-utils";
import { sendEmail } from "@/lib/email";
import { randomUUID } from "crypto";

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

  // Create new verification token (24 hour expiry)
  const token = randomUUID();
  await prisma.emailVerificationToken.create({
    data: {
      userId: user.id,
      token,
      email: user.email,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  // Send verification email
  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/verify-email?token=${token}`;
  await sendEmail({
    to: user.email,
    subject: "Verify your email - Probook",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a1a;">Verify Your Email</h2>
        <p>Click the link below to verify your email address:</p>
        <p style="margin: 24px 0;">
          <a href="${verifyUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">
            Verify Email
          </a>
        </p>
        <p style="color: #666; font-size: 14px;">This link will expire in 24 hours.</p>
        <p style="color: #666; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  });

  return NextResponse.json({ success: true });
});
