import { type Page } from "@playwright/test";

/**
 * Helper to make authenticated API calls via page.evaluate.
 * Returns { status, body } for assertions.
 *
 * The evaluation runs inside the page so it carries the session cookie, which
 * also means an in-flight navigation can tear its execution context down
 * mid-call — "Execution context was destroyed" — and fail a test that has
 * nothing to do with navigation. That is a property of the harness, not of the
 * application, so it is retried once against the settled page rather than
 * surfacing as a false failure.
 */
export async function api(
  page: Page,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; body: Record<string, unknown> }> {
  const run = () =>
    page.evaluate(
      async ([m, p, b]) => {
        const opts: RequestInit = {
          method: m,
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        };
        if (b) opts.body = b;
        const r = await fetch(p, opts);
        const json = await r.json().catch(() => ({}));
        return { status: r.status, body: json };
      },
      [method, path, body ? JSON.stringify(body) : null] as [string, string, string | null]
    );

  try {
    return await run();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/Execution context was destroyed|Target closed|frame was detached/i.test(message)) {
      throw err;
    }
    // Let the navigation finish, then ask again. A GET is safe to repeat; a
    // write that already reached the server is protected by the idempotency
    // keys the routes carry.
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    return run();
  }
}

/** Shorthand for GET */
export function apiGet(page: Page, path: string) {
  return api(page, "GET", path);
}

/** Shorthand for POST */
export function apiPost(page: Page, path: string, body?: unknown) {
  return api(page, "POST", path, body);
}

/** Shorthand for PUT */
export function apiPut(page: Page, path: string, body?: unknown) {
  return api(page, "PUT", path, body);
}

/** Shorthand for DELETE */
export function apiDelete(page: Page, path: string) {
  return page.evaluate(async (p) => {
    const r = await fetch(p, { method: "DELETE", credentials: "include" });
    // DELETE may return 204 with no body
    if (r.status === 204) return { status: 204, body: {} };
    const json = await r.json().catch(() => ({}));
    return { status: r.status, body: json };
  }, path);
}

/** Create a client and return the response body */
export async function setupClient(page: Page, name: string) {
  const res = await apiPost(page, "/api/clients", { name });
  return res.body as Record<string, unknown>;
}

/** Create a product and return the response body */
export async function setupProduct(
  page: Page,
  designation: string,
  unitPrice: number,
  extra?: Record<string, unknown>
) {
  const res = await apiPost(page, "/api/products", {
    designation,
    unit_price: unitPrice,
    tax_rate: 20,
    unit: "unit",
    is_service: false,
    ...extra,
  });
  return res.body as Record<string, unknown>;
}

/** Create a supplier and return the response body */
export async function setupSupplier(page: Page, name: string) {
  const res = await apiPost(page, "/api/suppliers", { name });
  return res.body as Record<string, unknown>;
}

/** Create a POS register and return the response body */
export async function setupRegister(page: Page, name: string) {
  const res = await apiPost(page, "/api/pos/registers", { name, is_active: true });
  return res.body as Record<string, unknown>;
}

/** Open a POS session and return the response body */
export async function openSession(page: Page, registerId: string, openingFloat: number = 0) {
  const res = await apiPost(page, "/api/pos/sessions/open", {
    register_id: registerId,
    opening_float: openingFloat,
  });
  return res.body as Record<string, unknown>;
}

/**
 * Create an invoice and issue it, the way the application does.
 *
 * The create route only makes drafts: issuing is a separate transition, and it
 * is where the integrity hash, the stamp-duty snapshot, the COGS snapshot and
 * the stock decrement happen. A test that wanted an issued invoice used to ask
 * for one at creation time and got an invoice with none of those.
 */
export async function setupIssuedInvoice(page: Page, body: Record<string, unknown>) {
  const created = await apiPost(page, "/api/invoices", body);
  if (created.status !== 200) return created;
  return apiPost(page, `/api/invoices/${created.body.id}/issue`);
}
