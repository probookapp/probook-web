import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";
import { apiGet, apiPost } from "./api-helpers";
import { setupPlatformAdmin, adminGet, adminPost, createTestPlan } from "./admin-helpers";

/**
 * Composing an offer module by module.
 *
 * The composed offer is a private plan: created inactive, so it never reaches
 * the shop window, while `feature-gate` resolves entitlements through the
 * plan's feature links and never looks at `isActive`. That is what lets one
 * business have an offer of its own without a schema for it — and it is exactly
 * the kind of cleverness that needs a test saying out loud what it relies on.
 *
 * The price is recomputed server-side from the catalogue. The figure the page
 * showed arrives from a screen the customer can edit, so it is an input to
 * nothing.
 */
/**
 * Subscribing is gated on a verified email — that is where account ownership is
 * confirmed. The guide films that step; here it is simply cleared.
 */
async function verifyEmail(page: import("@playwright/test").Page) {
  const status = await apiPost(page, "/api/test/verify-email", {});
  expect(status.status, JSON.stringify(status.body)).toBe(200);
}

/**
 * Put a sellable module and a listed offer in the catalogue, and return the
 * module's key.
 *
 * These tests used to assume `pos` was priced and some offer was active, which
 * is only true after `scripts/seed-plans.ts` has run. That made them pass on a
 * seeded machine and fail on a fresh database — CI, or a colleague's first
 * checkout. A test that depends on someone having run a seed is not testing the
 * product, it is testing the machine.
 *
 * An existing priced module is reused when there is one, so this stays cheap on
 * the shared test database rather than adding a row per run.
 */
async function aSellableModule(page: import("@playwright/test").Page): Promise<string> {
  await setupPlatformAdmin(page);

  const features = await adminGet(page, "/api/admin/features");
  const existing = (features.body as unknown as { key: string; unit_price: number | null }[]).find(
    (f) => f.unit_price != null
  );
  const key = existing?.key ?? `composable_${Date.now()}`;

  if (!existing) {
    const created = await adminPost(page, "/api/admin/features", {
      key,
      name: "Composable module",
      is_global: false,
      unit_price: 70_000,
    });
    expect(created.status, JSON.stringify(created.body).slice(0, 200)).toBe(201);
  }

  // `priceComposition` reads the cheapest *active* offer as the base everyone
  // pays, and the public list needs at least one row to compare against.
  const plans = await apiGet(page, "/api/subscription/plans");
  if ((plans.body.plans as unknown[]).length === 0) {
    const base = await createTestPlan(page, {
      slug: `base-${Date.now()}`,
      name: `Base ${Date.now()}`,
      monthly_price: 190_000,
      yearly_price: 1_900_000,
      currency: "DZD",
    });
    expect(base.status, JSON.stringify(base.body).slice(0, 200)).toBe(201);
  }

  return key;
}

test.describe("the offer composer", () => {
  test("a composition becomes a private offer nobody else can see", async ({ page }) => {
    await signUp(page);
    await verifyEmail(page);

    const moduleKey = await aSellableModule(page);

    const before = await apiGet(page, "/api/subscription/plans");
    const listed = (before.body.plans as unknown as { slug: string }[]).map((p) => p.slug);

    const requested = await apiPost(page, "/api/subscription/request", {
      billing_cycle: "monthly",
      request_type: "new",
      currency: "DZD",
      custom: { feature_keys: [moduleKey], seats: 3 },
    });
    expect(requested.status, JSON.stringify(requested.body)).toBe(201);

    // The shop window is unchanged: a private offer must not appear in it.
    const after = await apiGet(page, "/api/subscription/plans");
    const stillListed = (after.body.plans as unknown as { slug: string }[]).map((p) => p.slug);
    expect(stillListed).toEqual(listed);
    expect(stillListed.some((s) => s.startsWith("custom-"))).toBe(false);
  });

  test("the price is recomputed from the catalogue, not taken from the page", async ({ page }) => {
    await signUp(page);
    await verifyEmail(page);

    const moduleKey = await aSellableModule(page);

    // The server prices a composition off the cheapest active offer. Reading
    // that figure from the list would be a race: the shared test database gains
    // and loses offers while this runs, and the cheapest one can change between
    // the read and the request. Creating one that is unambiguously the cheapest
    // makes the arithmetic checkable instead of merely likely.
    const base = 100;
    const cheapest = await createTestPlan(page, {
      slug: `composer-base-${Date.now()}`,
      name: `Composer base ${Date.now()}`,
      monthly_price: base,
      yearly_price: base * 10,
      currency: "DZD",
      feature_ids: [],
    });
    expect(cheapest.status, JSON.stringify(cheapest.body).slice(0, 200)).toBe(201);

    // Straight from the catalogue, not from whatever an active offer happens to
    // carry: the public payload only exposes a module through the offers that
    // include it, so a module nobody bundles would read as unpriced here while
    // the server prices it perfectly well.
    const catalogue = await adminGet(page, "/api/admin/features");
    const till = (
      catalogue.body as unknown as { key: string; unit_price: number | null }[]
    ).find((f) => f.key === moduleKey)?.unit_price;
    expect(till, "the module must be priced for the composer to sell it").toBeTruthy();

    const requested = await apiPost(page, "/api/subscription/request", {
      billing_cycle: "monthly",
      request_type: "new",
      currency: "DZD",
      custom: { feature_keys: [moduleKey], seats: 1 },
    });
    expect(requested.status, JSON.stringify(requested.body)).toBe(201);

    await setupPlatformAdmin(page);
    const all = await adminGet(page, "/api/admin/plans");
    const minted = (all.body as unknown as {
      id: string;
      monthly_price: number;
      yearly_price: number;
      is_active: boolean;
      features: { feature?: { key: string } }[];
      quotas: { quota_key: string; limit_value: number }[];
    }[]).find((p) => p.id === requested.body.target_plan_id);

    expect(minted, "the composition should have minted an offer").toBeTruthy();
    expect(minted!.monthly_price).toBe(base + till!);
    // Ten months for twelve, the same discount the listed offers advertise.
    expect(minted!.yearly_price).toBe((base + till!) * 10);
    // Inactive is what keeps it out of the shop window while still granting.
    expect(minted!.is_active).toBe(false);
    expect(minted!.features.map((f) => f.feature?.key)).toEqual([moduleKey]);
    expect(minted!.quotas.find((q) => q.quota_key === "max_users")?.limit_value).toBe(1);
  });

  test("a module the catalogue does not sell is refused, never given away", async ({ page }) => {
    await signUp(page);
    await verifyEmail(page);

    const refused = await apiPost(page, "/api/subscription/request", {
      billing_cycle: "monthly",
      request_type: "new",
      currency: "DZD",
      custom: { feature_keys: ["not_a_real_module"], seats: 1 },
    });
    expect(refused.status, JSON.stringify(refused.body)).toBe(400);
    expect(refused.body.code).toBe("MODULE_NOT_SOLD");
    expect(refused.body.keys).toEqual(["not_a_real_module"]);
  });

  test("a request carries either an offer or a composition, never both", async ({ page }) => {
    await signUp(page);
    await verifyEmail(page);

    const moduleKey = await aSellableModule(page);

    const plans = await apiGet(page, "/api/subscription/plans");
    const first = (plans.body.plans as unknown as { id: string }[])[0];

    const both = await apiPost(page, "/api/subscription/request", {
      plan_id: first.id,
      billing_cycle: "monthly",
      request_type: "new",
      currency: "DZD",
      custom: { feature_keys: [moduleKey], seats: 1 },
    });
    expect(both.status).toBe(400);

    const neither = await apiPost(page, "/api/subscription/request", {
      billing_cycle: "monthly",
      request_type: "new",
      currency: "DZD",
    });
    expect(neither.status).toBe(400);
  });

  test("a currency the catalogue cannot price is refused, not mislabelled", async ({ page }) => {
    await signUp(page);
    await verifyEmail(page);
    const moduleKey = await aSellableModule(page);

    // Module prices carry no currency and nothing converts them. Minting a plan
    // labelled EUR off dinar figures would be wrong by the exchange rate, and
    // wrong quietly, every month.
    const refused = await apiPost(page, "/api/subscription/request", {
      billing_cycle: "monthly",
      request_type: "new",
      currency: "EUR",
      custom: { feature_keys: [moduleKey], seats: 1 },
    });
    expect(refused.status, JSON.stringify(refused.body)).toBe(400);
    expect(refused.body.code).toBe("CURRENCY_NOT_COMPOSABLE");
    // And it says which currency composing does work in.
    expect(refused.body.currency).toBe("DZD");
  });

  test("composing fewer seats than the team has is refused", async ({ page }) => {
    await signUp(page);
    await verifyEmail(page);
    const moduleKey = await aSellableModule(page);

    for (const n of [1, 2]) {
      const created = await apiPost(page, "/api/auth/users", {
        username: `compose${n}_${Date.now()}`,
        display_name: `Employé ${n}`,
        password: "Test1234!",
        role: "employee",
      });
      expect(created.status, JSON.stringify(created.body)).toBe(200);
    }

    // Three people, an offer composed for one: refused where the person asking
    // can still act on it, rather than silently at approval time.
    const refused = await apiPost(page, "/api/subscription/request", {
      billing_cycle: "monthly",
      request_type: "new",
      currency: "DZD",
      custom: { feature_keys: [moduleKey], seats: 1 },
    });
    expect(refused.status, JSON.stringify(refused.body)).toBe(409);
    expect(refused.body.code).toBe("SEATS_EXCEEDED");
    expect(refused.body.excess).toBe(2);
  });
});
