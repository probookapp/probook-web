import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { rateLimitAuth, rateLimitApi } from "@/lib/rate-limit";

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error("JWT_SECRET environment variable is required");
}
const JWT_SECRET = new TextEncoder().encode(jwtSecret);

const SUPPORTED_LOCALES = ["en", "fr", "ar"];
const DEFAULT_LOCALE = "en";

async function verifyTokenMiddleware(token: string) {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, { algorithms: ["HS256"] });
    return payload;
  } catch {
    return null;
  }
}

// A platform admin impersonating a tenant carries no probook_session cookie;
// admit the request when BOTH the admin session and the signed impersonation
// cookie verify.
async function hasValidImpersonation(req: NextRequest): Promise<boolean> {
  const adminToken = req.cookies.get("probook_admin_session")?.value;
  const impersonateToken = req.cookies.get("probook_impersonate")?.value;
  if (!adminToken || !impersonateToken) return false;

  const adminPayload = await verifyTokenMiddleware(adminToken);
  if (!adminPayload || adminPayload.isPlatformAdmin !== true) return false;

  const impersonatePayload = await verifyTokenMiddleware(impersonateToken);
  if (!impersonatePayload || impersonatePayload.purpose !== "impersonation") return false;

  return true;
}

function getPreferredLocale(req: NextRequest): string {
  // 1. Cookie (returning user)
  const cookie = req.cookies.get("NEXT_LOCALE")?.value;
  if (cookie && SUPPORTED_LOCALES.includes(cookie)) return cookie;

  // 2. Accept-Language header (first-time visitor)
  const acceptLang = req.headers.get("accept-language");
  if (acceptLang) {
    const primary = acceptLang.split(",")[0].split("-")[0].trim();
    if (SUPPORTED_LOCALES.includes(primary)) return primary;
  }

  return DEFAULT_LOCALE;
}

function getLocaleFromPath(pathname: string): string | null {
  const segments = pathname.split("/");
  const maybeLocale = segments[1];
  if (SUPPORTED_LOCALES.includes(maybeLocale)) return maybeLocale;
  return null;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Static assets — pass through
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/manifest") ||
    pathname.startsWith("/probook-icon") ||
    pathname.startsWith("/og-image") ||
    pathname.startsWith("/sw.js") ||
    (pathname.includes(".") && !pathname.startsWith("/api/"))
  ) {
    return NextResponse.next();
  }

  // API routes — no locale prefix, handle auth
  if (pathname.startsWith("/api/")) {
    // CSRF protection: verify Origin header on state-changing requests
    const method = req.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      const origin = req.headers.get("origin");
      const appHost = req.nextUrl.host;
      if (origin) {
        try {
          const originHost = new URL(origin).host;
          if (originHost !== appHost) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
          }
        } catch {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      }
    }

    // Admin API routes have their own auth
    if (pathname.startsWith("/api/admin/")) {
      // Admin auth routes get the stricter limit
      if (pathname.startsWith("/api/admin/auth/")) {
        const blocked = rateLimitAuth(req);
        if (blocked) return blocked;
      } else {
        const blocked = rateLimitApi(req);
        if (blocked) return blocked;
      }
      return NextResponse.next();
    }

    // Public API routes
    const publicApiPaths = [
      "/api/auth/login",
      "/api/auth/signup",
      "/api/auth/forgot-password",
      "/api/auth/reset-password",
      "/api/auth/verify-email",
      "/api/auth/totp/verify",
      "/api/subscription/plans",
      ...(process.env.NODE_ENV !== "production" ? ["/api/test/"] : []),
    ];

    // Auth-related public routes get a stricter rate limit (20/min)
    const authApiPaths = [
      "/api/auth/login",
      "/api/auth/signup",
      "/api/auth/forgot-password",
      "/api/auth/reset-password",
      "/api/auth/totp/verify",
    ];
    if (authApiPaths.some((p) => pathname.startsWith(p))) {
      const blocked = rateLimitAuth(req);
      if (blocked) return blocked;
    }

    if (publicApiPaths.some((p) => pathname.startsWith(p))) {
      return NextResponse.next();
    }

    // Protected API routes — standard rate limit (100/min)
    {
      const blocked = rateLimitApi(req);
      if (blocked) return blocked;
    }

    // Protected API routes — require tenant session (or admin impersonation)
    const token = req.cookies.get("probook_session")?.value;
    const session = token ? await verifyTokenMiddleware(token) : null;
    if (!session && !(await hasValidImpersonation(req))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // --- Locale routing for all page routes ---

  const pathLocale = getLocaleFromPath(pathname);

  // No locale in URL → redirect to /{locale}/path
  if (!pathLocale) {
    const locale = getPreferredLocale(req);
    const newPath = pathname === "/" ? `/${locale}` : `/${locale}${pathname}`;
    const url = new URL(newPath, req.url);
    url.search = req.nextUrl.search;
    return NextResponse.redirect(url);
  }

  // Persist the locale to a cookie so we remember it for next visit
  const response = NextResponse.next();
  response.cookies.set("NEXT_LOCALE", pathLocale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  // Path after locale prefix (e.g. /en/dashboard → /dashboard)
  const pathWithoutLocale = pathname.replace(`/${pathLocale}`, "") || "/";

  // Public pages (landing, login, signup, offline) — no auth required
  const publicPaths = ["/", "/login", "/signup", "/offline", "/pricing", "/about", "/contact", "/faq", "/terms", "/privacy", "/forgot-password", "/reset-password", "/verify-email"];
  if (publicPaths.includes(pathWithoutLocale)) {
    return response;
  }

  // Admin pages — admin has its own auth via cookies
  if (pathWithoutLocale.startsWith("/admin")) {
    return response;
  }

  // POS and all other app routes — require tenant session (or admin impersonation)
  const token = req.cookies.get("probook_session")?.value;
  const session = token ? await verifyTokenMiddleware(token) : null;
  if (!session && !(await hasValidImpersonation(req))) {
    return NextResponse.redirect(new URL(`/${pathLocale}/login`, req.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
