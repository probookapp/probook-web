import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import crypto from "crypto";
import { validateBody, isValidationError } from "@/lib/validate";
import { forgotPasswordSchema } from "@/lib/validations";

export async function POST(req: NextRequest) {
  try {
    const body = await validateBody(req, forgotPasswordSchema);
    if (isValidationError(body)) return body;
    const { email } = body;

    // Always return success to avoid leaking whether the email exists
    const successResponse = NextResponse.json({ success: true });

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
    });

    if (!user) {
      return successResponse;
    }

    // Rate limit: only allow creating a token if the last one was >2 minutes ago
    const recentToken = await prisma.passwordResetToken.findFirst({
      where: {
        userId: user.id,
        createdAt: { gte: new Date(Date.now() - 2 * 60 * 1000) },
      },
      orderBy: { createdAt: "desc" },
    });

    if (recentToken) {
      return successResponse;
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const resetLink = `${appUrl}/reset-password?token=${token}`;

    try {
      await sendEmail({
        to: email,
        subject: "Reset your password - Probook",
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1a1a1a;">Reset Your Password</h2>
            <p>You requested a password reset for your Probook account.</p>
            <p>Click the button below to reset your password. This link will expire in 1 hour.</p>
            <div style="margin: 24px 0;">
              <a href="${resetLink}" style="background-color: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block; font-weight: 500;">
                Reset Password
              </a>
            </div>
            <p style="color: #666; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
            <p style="color: #666; font-size: 14px;">Or copy this link: ${resetLink}</p>
          </div>
        `,
      });
    } catch (emailError) {
      console.error("Failed to send password reset email:", emailError);
    }

    return successResponse;
  } catch (error: unknown) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
