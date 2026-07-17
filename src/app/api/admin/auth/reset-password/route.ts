import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { validateBody, isValidationError } from "@/lib/validate";
import { resetPasswordSchema } from "@/lib/validations";

// Public: complete a platform-admin password reset with a valid token.
export async function POST(req: NextRequest) {
  try {
    const body = await validateBody(req, resetPasswordSchema);
    if (isValidationError(body)) return body;
    const { token, password } = body;

    const resetToken = await prisma.adminPasswordResetToken.findUnique({
      where: { token },
    });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Invalid or expired reset link" },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(password);

    await prisma.$transaction([
      prisma.platformAdmin.update({
        where: { id: resetToken.adminId },
        data: { passwordHash },
      }),
      prisma.adminPasswordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Admin reset password error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
