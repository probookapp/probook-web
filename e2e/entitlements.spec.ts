import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { signUp } from "./helpers";
import { apiGet, apiPost } from "./api-helpers";
import { adminGet } from "./admin-helpers";
import { assertTestDatabase } from "./assert-test-db";
import { setupPlatformAdmin, adminPost, adminPut, createTestPlan } from "./admin-helpers";

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

/**
 * Put the two gated modules and an offer carrying them in the catalogue.
 *
 * This suite used to carry a note saying it required `scripts/seed-plans.ts` to
 * have been run. That is a dependency on the machine, not on the product: it
 * held on a developer's seeded database and failed on a fresh one, which is
 * exactly what CI is. And the failure was the worst kind — with no flag in the
 * table the gate allows everything, so the test that exists to prove the gate
 * refuses would report that it does not.
 *
 * Anything already present is reused; `is_global` is forced off because a
 * globally-on flag is granted to everyone and would silently defeat the point.
 */
const GATED = ["pos", "multi_location"] as const;

async function ensureGatedCatalogue(page: import("@playwright/test").Page) {
  await setupPlatformAdmin(page);

  const features = await adminGet(page, "/api/admin/features");
  const rows = features.body as unknown as { id: string; key: string; is_global: boolean }[];

  const ids: string[] = [];
  for (const key of GATED) {
    const found = rows.find((f) => f.key === key);
    if (!found) {
      const created = await adminPost(page, "/api/admin/features", {
        key,
        name: key,
        is_global: false,
      });
      expect(created.status, JSON.stringify(created.body).slice(0, 200)).toBe(201);
      ids.push(created.body.id as string);
      continue;
    }
    if (found.is_global) {
      await adminPut(page, `/api/admin/features/${found.id}`, { is_global: false });
    }
    ids.push(found.id);
  }

  // A refusal that cannot name an offer is only a wall, so one has to carry them.
  const plans = await apiGet(page, "/api/subscription/plans");
  const carries = (
    plans.body.plans as unknown as { features?: { feature?: { key: string } }[] }[]
  ).some((p) => (p.features || []).some((f) => f.feature?.key === "multi_location"));

  if (!carries) {
    const stamp = Date.now();
    const plan = await createTestPlan(page, {
      slug: `gated-${stamp}`,
      name: `Gated ${stamp}`,
      monthly_price: 500_000,
      yearly_price: 5_000_000,
      currency: "DZD",
      feature_ids: ids,
    });
    expect(plan.status, JSON.stringify(plan.body).slice(0, 200)).toBe(201);
  }
}

test.describe("offer entitlements", () => {
  test("a trial carries every module; an expired one carries none of the gated ones", async ({
    page,
  }) => {
    const creds = await signUp(page);
    await ensureGatedCatalogue(page);

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

    // Two accounts exist, so the offer has to cover two for the move to be
    // allowed at all — assigning a smaller one is refused outright now
    // (lib/plan-downgrade.ts), which is a different rule tested elsewhere.
    const features = await adminGet(page, "/api/admin/features");
    const featureIds = (features.body as unknown as { id: string }[]).map((f) => f.id);
    const plan = await adminPost(page, "/api/admin/plans", {
      slug: `two-seats-${Date.now()}`,
      name: "Two Seats",
      monthly_price: 100000,
      yearly_price: 1000000,
      currency: "DZD",
      feature_ids: featureIds,
      quotas: [{ quota_key: "max_users", limit_value: 2 }],
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

    // At the ceiling: the third seat is refused. A quota nobody enforces is
    // decoration — this is the half that proves it is not.
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

  test("lowering an offer's ceiling never deactivates anyone", async ({ page }) => {
    const creds = await signUp(page);
    await setupPlatformAdmin(page);

    await apiPost(page, "/api/auth/users", {
      username: `garde_${Date.now()}`,
      display_name: "Deuxième",
      password: "Test1234!",
      role: "employee",
    });

    const features = await adminGet(page, "/api/admin/features");
    const featureIds = (features.body as unknown as { id: string }[]).map((f) => f.id);
    const plan = await adminPost(page, "/api/admin/plans", {
      slug: `shrinking-${Date.now()}`,
      name: "Shrinking",
      monthly_price: 100000,
      yearly_price: 1000000,
      currency: "DZD",
      feature_ids: featureIds,
      quotas: [{ quota_key: "max_users", limit_value: 3 }],
    });
    const tenantId = await tenantIdOf(creds.username);
    await adminPost(page, "/api/admin/subscriptions", {
      tenant_id: tenantId,
      plan_id: plan.body.id,
      billing_cycle: "yearly",
      status: "active",
    });

    // The offer's ceiling drops for everyone on it. This is the one case where
    // a business ends up over the line without having asked for anything, so
    // nobody is deactivated: they keep what they have and cannot add.
    const shrunk = await adminPut(page, `/api/admin/plans/${plan.body.id}`, {
      quotas: [{ quota_key: "max_users", limit_value: 1 }],
    });
    expect(shrunk.status, JSON.stringify(shrunk.body).slice(0, 200)).toBe(200);

    const roster = await apiGet(page, "/api/auth/users");
    const users = roster.body as unknown as { is_active: boolean }[];
    expect(users.length, "both accounts survive the cut").toBe(2);
    expect(users.every((u) => u.is_active), "and both are still active").toBe(true);

    // Frozen, not emptied.
    const refused = await apiPost(page, "/api/auth/users", {
      username: `apres_${Date.now()}`,
      display_name: "Après la baisse",
      password: "Test1234!",
      role: "employee",
    });
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe("USER_QUOTA_REACHED");
  });
});
