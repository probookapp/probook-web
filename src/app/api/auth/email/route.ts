import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, AuthContext } from "@/lib/api-utils";
import { sendEmail, verificationEmailHtml } from "@/lib/email";
import { issueEmailVerificationToken, isEmailTakenByVerifiedUser } from "@/lib/verification";
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

  // Refuse an address another account already verified — it could never be
  // verified here and would undermine email as an ownership signal.
  if (await isEmailTakenByVerifiedUser(email, user.id)) {
    return NextResponse.json(
      { error: "This email is already in use by another account.", code: "EMAIL_TAKEN" },
      { status: 409 }
    );
  }

  // 2-minute throttle per user (matches resend-verification) — this route sends
  // to a caller-supplied address, so it must not be usable to email-bomb.
  const lastToken = await prisma.emailVerificationToken.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  if (lastToken && lastToken.createdAt > new Date(Date.now() - 2 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Please wait before requesting another verification email" },
      { status: 429 }
    );
  }

  // Persist the (unverified) address so resend/verify flows have it to work with.
  await prisma.user.update({
    where: { id: user.id },
    data: { email, emailVerified: false },
  });

  const token = await issueEmailVerificationToken(user.id, email);
  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/verify-email?token=${token}`;
  try {
    await sendEmail({
      to: email,
      subject: "Verify your email - Probook",
      html: verificationEmailHtml(verifyUrl),
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
