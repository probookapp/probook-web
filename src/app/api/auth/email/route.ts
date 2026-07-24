import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, AuthContext } from "@/lib/api-utils";
import { sendEmail } from "@/lib/email";
import { randomUUID } from "crypto";
import { validateBody, isValidationError } from "@/lib/validate";
import { setEmailSchema } from "@/lib/validations";

// Self-service: a logged-in user sets or updates their own email address and
// receives a fresh verification link. Needed for accounts created before email
// was collected, and for anyone who wants to (re)verify before subscribing.
export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const body = await validateBody(req, setEmailSchema);
  if (isValidationError(body)) return body;
  const { email } = body;

  const user = await prisma.user.findUnique({
    where: { id: ctx.session.userId },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Already verified with this exact address → nothing to do.
  if (user.email === email && user.emailVerified) {
    return NextResponse.json({ verified: true });
  }

  // Persist the (unverified) address so resend/verify flows have it to work with.
  await prisma.user.update({
    where: { id: user.id },
    data: { email, emailVerified: false },
  });

  const token = randomUUID();
  await prisma.emailVerificationToken.create({
    data: {
      userId: user.id,
      token,
      email,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/verify-email?token=${token}`;
  try {
    await sendEmail({
      to: email,
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
  } catch (emailError) {
    console.error("Failed to send verification email:", emailError);
    return NextResponse.json(
      { error: "Could not send the verification email. Please try again." },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true });
});
