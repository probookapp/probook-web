import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { verifyEmailSchema } from "@/lib/validations";
import { isEmailTakenByVerifiedUser } from "@/lib/verification";
import { Prisma } from "@/generated/prisma/client";

export async function POST(req: NextRequest) {
  try {
    const body = await validateBody(req, verifyEmailSchema);
    if (isValidationError(body)) return body;
    const { token } = body;

    const verificationToken = await prisma.emailVerificationToken.findUnique({
      where: { token },
    });

    if (!verificationToken) {
      return NextResponse.json(
        { error: "Invalid verification token", code: "TOKEN_INVALID" },
        { status: 400 }
      );
    }

    if (verificationToken.usedAt) {
      // Idempotent replay: one click can reach this route twice (in-app webview
      // then real browser, a remount, a mail scanner). The second call must not
      // report failure when the first one already verified the address —
      // possession of the token was proven either way.
      const user = await prisma.user.findUnique({
        where: { id: verificationToken.userId },
        select: { email: true, emailVerified: true },
      });
      if (
        user?.emailVerified &&
        user.email?.toLowerCase() === verificationToken.email.toLowerCase()
      ) {
        return NextResponse.json({ success: true, already_verified: true });
      }
      return NextResponse.json(
        { error: "Token already used", code: "TOKEN_USED" },
        { status: 400 }
      );
    }

    if (verificationToken.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Token expired", code: "TOKEN_EXPIRED" },
        { status: 400 }
      );
    }

    // Refuse if another account already verified this address. The database now
    // carries the same rule as a partial unique index, so this check is the
    // friendly message rather than the guarantee — and the catch below turns the
    // one case it cannot see, a simultaneous verify, into the same answer.
    if (await isEmailTakenByVerifiedUser(verificationToken.email, verificationToken.userId)) {
      return NextResponse.json(
        { error: "This email is already verified on another account.", code: "EMAIL_TAKEN" },
        { status: 409 }
      );
    }

    // Update user and mark token as used in a transaction
    try {
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: verificationToken.userId },
          data: {
            emailVerified: true,
            email: verificationToken.email,
          },
        });

        await tx.emailVerificationToken.update({
          where: { id: verificationToken.id },
          data: { usedAt: new Date() },
        });
      });
    } catch (e: unknown) {
      // The other half of the race: two verifications for one address landed
      // together, both read "free", and the index refused the second. The
      // person on the losing side gets the sentence that explains it, not a
      // five hundred.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        return NextResponse.json(
          { error: "This email is already verified on another account.", code: "EMAIL_TAKEN" },
          { status: 409 }
        );
      }
      throw e;
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Verify email error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Verification failed" },
      { status: 500 }
    );
  }
}
