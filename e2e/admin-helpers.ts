import { type Page } from "@playwright/test";
import { api } from "./api-helpers";

/**
 * Create a platform admin directly in the DB via a raw SQL approach,
 * then log in via the admin API. Returns the admin session cookie context.
 *
 * We use a signup + direct API approach: first create a regular tenant user
 * (to have a page context), then use page.evaluate to call the admin login.
 */
export async function setupPlatformAdmin(page: Page) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const username = `testadmin_${id}`;
  const email = `testadmin_${id}@test.local`;
  const password = "AdminPass123!";

  // Through api(), not a raw page.evaluate: the helper retries when an
  // in-flight navigation tears the execution context down mid-call, which is
  // what "Failed to fetch" here used to mean.
  const res = await api(page, "POST", "/api/test/create-admin", {
    username,
    email,
    password,
  });

  if (res.status !== 200) {
    throw new Error(`Failed to create test admin (${res.status}): ${JSON.stringify(res.body)}`);
  }

  // Log in as admin
  const login = await api(page, "POST", "/api/admin/auth/login", {
    username,
    password,
  });

  if (login.status !== 200) {
    throw new Error(`Admin login failed (${login.status}): ${JSON.stringify(login.body)}`);
  }

  return { username, email, password, adminId: login.body.id as string };
}

/** Make an admin API call (same as api() but the admin cookie is already set) */
export async function adminGet(page: Page, path: string) {
  return api(page, "GET", path);
}

export async function adminPost(page: Page, path: string, body?: unknown) {
  return api(page, "POST", path, body);
}

export async function adminPut(page: Page, path: string, body?: unknown) {
  return api(page, "PUT", path, body);
}

export async function adminDelete(page: Page, path: string) {
  return page.evaluate(async (p) => {
    const r = await fetch(p, { method: "DELETE", credentials: "include" });
    if (r.status === 204) return { status: 204, body: {} };
    const json = await r.json().catch(() => ({}));
    return { status: r.status, body: json };
  }, path);
}

/**
 * Create a plan the way the product expects one: carrying entitlements.
 *
 * An active offer that links no feature is refused (PLAN_HAS_NO_FEATURES),
 * because in production it means a paying customer who silently receives
 * nothing. Tests that only need "a plan to bill against" still need one that
 * contains something, so this fills in every feature unless told otherwise.
 */
export async function createTestPlan(page: Page, body: Record<string, unknown>) {
  if (!("feature_ids" in body)) {
    const features = await adminGet(page, "/api/admin/features");
    const ids = (features.body as unknown as { id: string }[]).map((f) => f.id);
    body = { ...body, feature_ids: ids };
  }
  return adminPost(page, "/api/admin/plans", body);
}
