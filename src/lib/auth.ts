import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);
const COOKIE_NAME = "probook_session";
const ADMIN_COOKIE_NAME = "probook_admin_session";
const IMPERSONATE_COOKIE_NAME = "probook_impersonate";
const TOKEN_EXPIRY = "7d";

export interface SessionPayload {
  userId: string;
  tenantId: string;
  role: string;
}

export interface PlatformSessionPayload {
  userId: string;
  tenantId: null;
  role: string; // 'super_admin' | 'support_agent'
  isPlatformAdmin: true;
}

export async function createToken(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(TOKEN_EXPIRY)
    .setIssuedAt()
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, { algorithms: ["HS256"] });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function requireAuth(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  return session;
}

export async function requireAdmin(): Promise<SessionPayload> {
  const session = await requireAuth();
  if (session.role !== "admin") {
    throw new Error("Forbidden: admin access required");
  }
  return session;
}

// ========== Platform Admin Auth ==========

export async function createAdminToken(payload: PlatformSessionPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(TOKEN_EXPIRY)
    .setIssuedAt()
    .sign(JWT_SECRET);
}

export async function getAdminSession(): Promise<PlatformSessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, { algorithms: ["HS256"] });
    const data = payload as unknown as PlatformSessionPayload;
    if (!data.isPlatformAdmin) return null;
    return data;
  } catch {
    return null;
  }
}

export async function setAdminSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearAdminSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE_NAME);
}

// ========== Impersonation ==========
// The impersonation cookie is a SIGNED JWT (not plain JSON) so a compromised or
// lower-privileged admin cannot forge one client-side. withAuth additionally
// requires a live super_admin session whose userId matches the adminId claim.

export async function setImpersonationCookie(tenantId: string, adminId: string) {
  const cookieStore = await cookies();
  const token = await new SignJWT({ tenantId, adminId, purpose: "impersonation" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("4h")
    .setIssuedAt()
    .sign(JWT_SECRET);
  cookieStore.set(IMPERSONATE_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 4, // 4 hours max
  });
}

export async function getImpersonationData(): Promise<{ tenantId: string; adminId: string } | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(IMPERSONATE_COOKIE_NAME)?.value;
  if (!value) return null;
  try {
    const { payload } = await jwtVerify(value, JWT_SECRET, { algorithms: ["HS256"] });
    if (payload.purpose !== "impersonation") return null;
    if (typeof payload.tenantId !== "string" || typeof payload.adminId !== "string") return null;
    return { tenantId: payload.tenantId, adminId: payload.adminId };
  } catch {
    return null;
  }
}

export async function clearImpersonationCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(IMPERSONATE_COOKIE_NAME);
}

// ========== Token Hashing for Sessions ==========

export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function getSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value ?? null;
}

// ========== 2FA Challenge Tokens ==========

/**
 * Create a short-lived signed token that proves the user completed step 1 (username+password).
 * This prevents attackers from skipping login and going straight to TOTP brute-force.
 */
export async function createTotpChallengeToken(userId: string): Promise<string> {
  return new SignJWT({ userId, purpose: "totp_challenge" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("5m")
    .setIssuedAt()
    .sign(JWT_SECRET);
}

/**
 * Verify a TOTP challenge token and extract the userId.
 * Returns null if the token is invalid, expired, or not a challenge token.
 */
export async function verifyTotpChallengeToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, { algorithms: ["HS256"] });
    if (payload.purpose !== "totp_challenge" || !payload.userId) return null;
    return payload.userId as string;
  } catch {
    return null;
  }
}

// ========== Platform Admin 2FA Challenge Tokens ==========

/**
 * Create a short-lived signed token proving a platform admin completed step 1
 * (username+password). Separate purpose from the tenant challenge so a token
 * from one realm can never be replayed against the other.
 */
export async function createAdminTotpChallengeToken(adminId: string): Promise<string> {
  return new SignJWT({ adminId, purpose: "admin_totp_challenge" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("5m")
    .setIssuedAt()
    .sign(JWT_SECRET);
}

/**
 * Verify a platform admin TOTP challenge token and extract the adminId.
 * Returns null if invalid, expired, or not an admin challenge token.
 */
export async function verifyAdminTotpChallengeToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, { algorithms: ["HS256"] });
    if (payload.purpose !== "admin_totp_challenge" || !payload.adminId) return null;
    return payload.adminId as string;
  } catch {
    return null;
  }
}

// ========== Platform Admin TOTP Secret Encryption ==========
// The admin TOTP secret is stored encrypted at rest (AES-256-GCM). Ciphertext is
// stored as base64 of (12-byte IV || ciphertext+tag).
//
// The encryption key prefers a DEDICATED env var (TOTP_ENCRYPTION_KEY) so that
// rotating JWT_SECRET — which signs sessions — never renders stored TOTP secrets
// undecryptable (which would lock every 2FA admin out). When the dedicated key
// is unset we fall back to JWT_SECRET, preserving the previous behavior. On
// decrypt we try each key material in turn, so secrets written under the old
// (JWT-derived) key keep working after a dedicated key is introduced.

async function importTotpKey(material: BufferSource): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", material);
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Key materials in preference order: dedicated key first, JWT_SECRET fallback. */
function totpKeyMaterials(): BufferSource[] {
  const materials: BufferSource[] = [];
  const dedicated = process.env.TOTP_ENCRYPTION_KEY;
  if (dedicated) materials.push(new TextEncoder().encode(dedicated));
  materials.push(JWT_SECRET);
  return materials;
}

export async function encryptTotpSecret(secret: string): Promise<string> {
  const key = await importTotpKey(totpKeyMaterials()[0]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(secret)
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return Buffer.from(combined).toString("base64");
}

export async function decryptTotpSecret(encrypted: string): Promise<string> {
  const combined = new Uint8Array(Buffer.from(encrypted, "base64"));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  let lastError: unknown;
  for (const material of totpKeyMaterials()) {
    try {
      const key = await importTotpKey(material);
      const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        ciphertext
      );
      return new TextDecoder().decode(plaintext);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error("Failed to decrypt TOTP secret");
}

/**
 * Decrypt a stored tenant TOTP secret. Legacy rows hold the raw base32 secret:
 * on decrypt failure fall back to treating the stored value as plaintext.
 * Callers should re-encrypt (lazy migration) after a successful verification
 * when `legacyPlaintext` is true.
 */
export async function decryptTotpSecretWithFallback(
  stored: string
): Promise<{ secret: string; legacyPlaintext: boolean }> {
  try {
    return { secret: await decryptTotpSecret(stored), legacyPlaintext: false };
  } catch {
    return { secret: stored, legacyPlaintext: true };
  }
}
