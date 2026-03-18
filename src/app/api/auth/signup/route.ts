import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, createToken, setSessionCookie, hashToken } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { randomUUID } from "crypto";
import { validateBody, isValidationError } from "@/lib/validate";
import { signupSchema } from "@/lib/validations";

export async function POST(req: NextRequest) {
  try {
    const body = await validateBody(req, signupSchema);
    if (isValidationError(body)) return body;
    const { company_name, username, display_name, password, email } = body;

    // Generate slug from company name
    const baseSlug = company_name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    // Ensure slug uniqueness
    let slug = baseSlug;
    let suffix = 0;
    while (await prisma.tenant.findUnique({ where: { slug } })) {
      suffix++;
      slug = `${baseSlug}-${suffix}`;
    }

    // Check if username is already taken (across all tenants)
    const existingUser = await prisma.user.findFirst({
      where: { username },
    });
    if (existingUser) {
      return NextResponse.json(
        { error: "Username already taken" },
        { status: 409 }
      );
    }

    // Create tenant + admin user + permissions in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: company_name,
          slug,
          status: "pending",
        },
      });

      await tx.companySettings.create({
        data: {
          tenantId: tenant.id,
          companyName: company_name,
        },
      });

      const passwordHash = await hashPassword(password);
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          username,
          displayName: display_name,
          passwordHash,
          role: "admin",
          ...(email ? { email } : {}),
        },
      });

      const allPermissions = [
        "dashboard", "clients", "products", "suppliers", "quotes",
        "invoices", "delivery_notes", "phonebook", "reports",
        "expenses", "settings", "pos",
      ];
      await tx.userPermission.createMany({
        data: allPermissions.map((key) => ({
          userId: user.id,
          permissionKey: key,
          granted: true,
        })),
      });

      const permissions = await tx.userPermission.findMany({
        where: { userId: user.id, granted: true },
      });

      return { tenant, user, permissions };
    });

    // Send verification email if email was provided
    if (email) {
      try {
        const verificationToken = randomUUID();
        await prisma.emailVerificationToken.create({
          data: {
            userId: result.user.id,
            token: verificationToken,
            email,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });

        const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/verify-email?token=${verificationToken}`;
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
        // Don't block signup on email sending failure
        console.error("Failed to send verification email:", emailError);
      }
    }

    // Create session and set cookie
    const token = await createToken({
      userId: result.user.id,
      tenantId: result.tenant.id,
      role: "admin",
    });
    await setSessionCookie(token);

    // Create UserSession record
    const tokenHash = await hashToken(token);
    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      undefined;
    const userAgent = req.headers.get("user-agent") || undefined;
    await prisma.userSession.create({
      data: {
        userId: result.user.id,
        tokenHash,
        userAgent,
        ipAddress,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return NextResponse.json({
      id: result.user.id,
      username: result.user.username,
      display_name: result.user.displayName,
      role: result.user.role,
      is_active: result.user.isActive,
      permissions: result.permissions.map((p) => p.permissionKey),
      created_at: result.user.createdAt.toISOString(),
      updated_at: result.user.updatedAt.toISOString(),
    });
  } catch (error: unknown) {
    console.error("Signup error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Signup failed" },
      { status: 500 }
    );
  }
}
