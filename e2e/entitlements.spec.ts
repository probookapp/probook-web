import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { signUp } from "./helpers";
import { apiGet, apiPost } from "./api-helpers";
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

  test("an active offer cannot be created empty", async ({ page }) => {
    await signUp(page);
    await setupPlatformAdmin(page);

    // An offer that links no feature refuses every gated module to whoever
    // subscribes to it, silently: they pay, sign in, and the modules they were
    // sold are simply not there. The mistake belongs to the person creating the
    // offer, so it is refused where they can see it.
    const empty = await adminPost(page, "/api/admin/plans", {
      slug: `empty-plan-${Date.now()}`,
      name: "Offre vide",
      monthly_price: 100000,
      yearly_price: 1000000,
      currency: "DZD",
    });
    expect(empty.status).toBe(400);
    expect(empty.body.code).toBe("PLAN_HAS_NO_FEATURES");

    // A draft can still be written down while the contents are being decided.
    const draft = await adminPost(page, "/api/admin/plans", {
      slug: `draft-plan-${Date.now()}`,
      name: "Brouillon",
      monthly_price: 100000,
      yearly_price: 1000000,
      currency: "DZD",
      is_active: false,
    });
    expect(draft.status, JSON.stringify(draft.body)).toBe(201);
  });
});
