import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { verifyEmailSchema } from "@/lib/validations";

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
        { error: "Invalid verification token" },
        { status: 400 }
      );
    }

    if (verificationToken.usedAt) {
      return NextResponse.json(
        { error: "Token already used" },
        { status: 400 }
      );
    }

    if (verificationToken.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Token expired" },
        { status: 400 }
      );
    }

    // Update user and mark token as used in a transaction
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

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Verify email error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Verification failed" },
      { status: 500 }
    );
  }
}
