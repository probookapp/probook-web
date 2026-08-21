import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { signUp } from "./helpers";
import { apiGet, apiPost } from "./api-helpers";
import { adminGet } from "./admin-helpers";
import { assertTestDatabase } from "./assert-test-db";
import { setupPlatformAdmin, adminPost } from "./admin-helpers";

/**
 * Proves the offer gate both ways.
 *
 * A gate that never refuses anything is indistinguishable from no gate at all,
 * and that is exactly the state this feature shipped in for months: the code
 * called `requireFeature`, no flag existed, and every call returned "allowed".
 * Nothing failed, so nobody noticed. So the interesting half of this test is
 * not that a trial can create a location — it is that an account whose trial
 * has run out, with no subscription, cannot.
 *
 * It also pins the two rules that make the gate humane: reads keep working, so
 * a business that moves to a smaller offer can still open its own history; and
 * the refusal names the offer that would bring the module back.
 */

assertTestDatabase(process.env.DATABASE_URL);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

test.afterAll(async () => {
  await pool.end();
});


/** The tenant behind a signup, for the admin routes that key on tenant id. */
async function tenantIdOf(username: string): Promise<string> {
  const r = await pool.query<{ tenant_id: string }>(
    `SELECT tenant_id FROM users WHERE username = $1 LIMIT 1`,
    [username]
  );
  if (!r.rows[0]) throw new Error(`no tenant for ${username}`);
  return r.rows[0].tenant_id;
}

/** Requires the offers to be seeded — scripts/seed-plans.ts. */
test.describe("offer entitlements", () => {
  test("a trial carries every module; an expired one carries none of the gated ones", async ({
    page,
  }) => {
    const creds = await signUp(page);

    // ─── inside the trial ───
    const included = await apiGet(page, "/api/entitlements");
    expect(included.status).toBe(200);
    expect(included.body.multi_location).toEqual({ included: true });

    const created = await apiPost(page, "/api/locations", {
      name: "Dépôt d'essai",
      is_default: false,
    });
    expect(created.status, "a trial must be able to use what it is evaluating").toBe(201);

    // ─── the trial runs out, and nothing was bought ───
    const expired = await pool.query(
      `UPDATE tenants SET trial_ends_at = NOW() - INTERVAL '1 day'
        WHERE id IN (SELECT tenant_id FROM users WHERE username = $1)`,
      [creds.username]
    );
    expect(expired.rowCount, "the signup's tenant was not found").toBe(1);

    const refused = await apiPost(page, "/api/locations", {
      name: "Deuxième dépôt",
      is_default: false,
    });
    expect(refused.status, "the gate let a write through with no offer behind it").toBe(403);

    // ─── what they already have stays readable ───
    const stillReadable = await apiGet(page, "/api/locations");
    expect(
      stillReadable.status,
      "a smaller offer must not lock a business out of its own history"
    ).toBe(200);

    // ─── and the interface is told where to find it ───
    const after = await apiGet(page, "/api/entitlements");
    const entitlements = after.body as Record<string, { included: boolean; upgradeTo?: { name: string } }>;
    expect(entitlements.multi_location.included).toBe(false);
    expect(
      entitlements.multi_location.upgradeTo?.name,
      "the refusal has to name the offer that carries it, or it is only a wall"
    ).toBeTruthy();

    // The till is in the entry offer, but this account holds no offer at all —
    // so it is refused too, and pointed at the cheapest one that carries it.
    expect(entitlements.pos.included).toBe(false);
    // Named, not named *this*: the shared test database is full of plans other
    // suites create, any of which can be the cheapest one carrying the till.
    expect(entitlements.pos.upgradeTo?.name).toBeTruthy();

    // ─── what no offer gates keeps working ───
    // Invoicing, VAT and the stamp duty are legal obligations. Selling them
    // separately would mean selling a customer documents they cannot use.
    const invoices = await apiPost(page, "/api/clients", { name: "Client hors offre" });
    expect(invoices.status, "billing must never depend on an offer").toBe(200);
  });

  test("an offer may carry no add-on module", async ({ page }) => {
    await signUp(page);
    await setupPlatformAdmin(page);

    // The entry offer is the core product — invoicing, quotes, the catalogue —
    // which is never sold separately, so it links no entitlement at all. An
    // earlier version of this refused such a plan on the grounds that a paying
    // customer would receive nothing; they receive the product.
    const bare = await adminPost(page, "/api/admin/plans", {
      slug: `bare-plan-${Date.now()}`,
      name: "Offre socle",
      monthly_price: 100000,
      yearly_price: 1000000,
      currency: "DZD",
    });
    expect(bare.status, JSON.stringify(bare.body)).toBe(201);
  });
});

test.describe("offer quotas", () => {
  test("the user ceiling refuses the seat it does not cover", async ({ page }) => {
    const creds = await signUp(page);
    await setupPlatformAdmin(page);

    // A trial has no ceiling — metering an evaluation would misrepresent it.
    const duringTrial = await apiPost(page, "/api/auth/users", {
      username: `trial_seat_${Date.now()}`,
      display_name: "Pendant l'essai",
      password: "Test1234!",
      role: "employee",
    });
    expect(duringTrial.status, "a trial must not be metered").toBe(200);

    // Put the account on a one-seat offer, the way an admin would.
    const features = await adminGet(page, "/api/admin/features");
    const featureIds = (features.body as unknown as { id: string }[]).map((f) => f.id);
    const plan = await adminPost(page, "/api/admin/plans", {
      slug: `one-seat-${Date.now()}`,
      name: "One Seat",
      monthly_price: 100000,
      yearly_price: 1000000,
      currency: "DZD",
      feature_ids: featureIds,
      quotas: [{ quota_key: "max_users", limit_value: 1 }],
    });
    expect(plan.status, JSON.stringify(plan.body)).toBe(201);

    const tenantId = await tenantIdOf(creds.username);
    const sub = await adminPost(page, "/api/admin/subscriptions", {
      tenant_id: tenantId,
      plan_id: plan.body.id,
      billing_cycle: "yearly",
      status: "active",
    });
    expect(sub.status, JSON.stringify(sub.body)).toBe(201);

    // Already over the ceiling: the accounts that exist are never touched, but
    // no further seat is granted. A quota nobody enforces is decoration — this
    // is the half that proves it is not.
    const refused = await apiPost(page, "/api/auth/users", {
      username: `over_quota_${Date.now()}`,
      display_name: "Au-delà du plafond",
      password: "Test1234!",
      role: "employee",
    });
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe("USER_QUOTA_REACHED");

    // And the team they already have is still readable.
    const roster = await apiGet(page, "/api/auth/users");
    expect(roster.status).toBe(200);
  });
});
