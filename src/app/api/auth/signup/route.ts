import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, createToken, setSessionCookie, hashToken } from "@/lib/auth";
import { sendEmail, verificationEmailHtml } from "@/lib/email";
import { issueEmailVerificationToken, isEmailTakenByVerifiedUser } from "@/lib/verification";
import { validateBody, isValidationError } from "@/lib/validate";
import { signupSchema } from "@/lib/validations";
import { getClientIp } from "@/lib/client-ip";
import { isUsernameTaken, freeSignupUsername } from "@/lib/usernames";
import { DEFAULT_FISCAL_PROFILE, getFiscalProfile } from "@/lib/fiscal-profiles";
import { rateLimitDurable } from "@/lib/rate-limit";
import { serializeUserInfo } from "@/lib/user-info";

// New signups get a free trial with full (non-demo) access, after which they
// must subscribe (or contact us). Kept in sync with the admin default.
const SIGNUP_TRIAL_DAYS = 10;

export async function POST(req: NextRequest) {
  try {
    // Durable throttle: 5 signups per hour per IP (Redis-backed in production)
    const clientIp = getClientIp(req);
    const rateLimited = await rateLimitDurable("signup", clientIp, {
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });
    if (rateLimited) return rateLimited;

    const body = await validateBody(req, signupSchema);
    if (isValidationError(body)) return body;
    const { company_name, display_name, password, email, username_auto } = body;
    const profile = getFiscalProfile(body.fiscal_profile ?? DEFAULT_FISCAL_PROFILE);

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

    // Check if username is already taken (across all tenants). One filled in
    // from the email and left alone is swapped for a free variant instead.
    const username = username_auto
      ? await freeSignupUsername(body.username, slug)
      : body.username;
    if (!username || (!username_auto && (await isUsernameTaken(username)))) {
      // Deliberately vague: a "username already taken" message would let
      // anyone probe which usernames exist across all tenants.
      return NextResponse.json(
        { error: "Unable to create an account with these details. Please try a different username." },
        { status: 409 }
      );
    }

    // At most one account may hold a given verified email (identity signal for
    // the subscribe gate and password reset).
    if (await isEmailTakenByVerifiedUser(email)) {
      return NextResponse.json(
        { error: "An account with this email already exists.", code: "EMAIL_TAKEN" },
        { status: 409 }
      );
    }

    const trialStartedAt = new Date();
    const trialEndsAt = new Date(
      trialStartedAt.getTime() + SIGNUP_TRIAL_DAYS * 24 * 60 * 60 * 1000
    );

    // Create tenant + admin user + permissions in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: company_name,
          slug,
          status: "pending",
          trialStartedAt,
          trialEndsAt,
        },
      });

      await tx.companySettings.create({
        data: {
          tenantId: tenant.id,
          companyName: company_name,
          fiscalProfile: profile.id,
          currency: profile.defaultCurrency,
          defaultTaxRate: profile.defaultTaxRate,
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

      // The account that signs up owns the business. Recorded here rather than
      // inferred later from "the oldest user": that deduction is invisible in
      // the data and breaks the day the row is removed.
      await tx.tenant.update({
        where: { id: tenant.id },
        data: { ownerUserId: user.id },
      });

      const permissions = await tx.userPermission.findMany({
        where: { userId: user.id },
      });

      return { tenant, user, permissions };
    });

    // Send verification email if email was provided
    let verificationEmailSent = false;
    if (email) {
      try {
        const verificationToken = await issueEmailVerificationToken(result.user.id, email);
        await sendEmail({
          to: email,
          subject: "Verify your email - Probook",
          html: verificationEmailHtml(
            `${process.env.NEXT_PUBLIC_APP_URL}/verify-email?token=${verificationToken}`
          ),
        });
        verificationEmailSent = true;
      } catch (emailError) {
        // Don't block signup on email sending failure, but report it so the
        // client can tell the user to resend rather than wait for a lost email.
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
    const ipAddress = clientIp === "unknown" ? undefined : clientIp;
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
      ...serializeUserInfo(result.user, result.permissions),
      verification_email_sent: verificationEmailSent,
    });
  } catch (error: unknown) {
    console.error("Signup error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
