import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import crypto from "crypto";
import { validateBody, isValidationError } from "@/lib/validate";
import { forgotPasswordSchema } from "@/lib/validations";

// Public: platform-admin password recovery. Mirrors the tenant flow, but scoped
// to PlatformAdmin + AdminPasswordResetToken and links to /admin/reset-password.
export async function POST(req: NextRequest) {
  try {
    const body = await validateBody(req, forgotPasswordSchema);
    if (isValidationError(body)) return body;
    const { email } = body;

    // Always return success to avoid leaking whether the email exists
    const successResponse = NextResponse.json({ success: true });

    const admin = await prisma.platformAdmin.findFirst({
      where: { email: { equals: email, mode: "insensitive" }, isActive: true },
    });

    if (!admin) {
      return successResponse;
    }

    // Rate limit: skip if a token was created in the last 2 minutes
    const recentToken = await prisma.adminPasswordResetToken.findFirst({
      where: {
        adminId: admin.id,
        createdAt: { gte: new Date(Date.now() - 2 * 60 * 1000) },
      },
      orderBy: { createdAt: "desc" },
    });

    if (recentToken) {
      return successResponse;
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.adminPasswordResetToken.create({
      data: { adminId: admin.id, token, expiresAt },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const resetLink = `${appUrl}/admin/reset-password?token=${token}`;

    try {
      await sendEmail({
        to: admin.email,
        subject: "Reset your admin password - Probook",
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1a1a1a;">Reset Your Admin Password</h2>
            <p>A password reset was requested for your Probook platform admin account.</p>
            <p>Click the button below to reset your password. This link expires in 1 hour.</p>
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
      console.error("Failed to send admin password reset email:", emailError);
    }

    return successResponse;
  } catch (error: unknown) {
    console.error("Admin forgot password error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
