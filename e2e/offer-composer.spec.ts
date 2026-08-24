import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";
import { apiGet, apiPost } from "./api-helpers";
import { setupPlatformAdmin, adminGet } from "./admin-helpers";

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

test.describe("the offer composer", () => {
  test("a composition becomes a private offer nobody else can see", async ({ page }) => {
    await signUp(page);
    await verifyEmail(page);

    const before = await apiGet(page, "/api/subscription/plans");
    const listed = (before.body.plans as unknown as { slug: string }[]).map((p) => p.slug);

    const requested = await apiPost(page, "/api/subscription/request", {
      billing_cycle: "monthly",
      request_type: "new",
      currency: "DZD",
      custom: { feature_keys: ["pos"], seats: 3 },
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

    const plans = await apiGet(page, "/api/subscription/plans");
    const rows = plans.body.plans as unknown as {
      monthly_price: number;
      features?: { feature?: { key: string; unit_price?: number | null } }[];
    }[];

    // The entry offer is the base everyone pays; the module prices come from
    // the same catalogue the page read.
    const base = rows.reduce((cheapest, p) =>
      p.monthly_price < cheapest.monthly_price ? p : cheapest
    ).monthly_price;
    const unitPrices = new Map<string, number>();
    for (const p of rows) {
      for (const link of p.features || []) {
        if (link.feature?.key && link.feature.unit_price != null) {
          unitPrices.set(link.feature.key, link.feature.unit_price);
        }
      }
    }
    const till = unitPrices.get("pos");
    expect(till, "the till must be priced for the composer to sell it").toBeTruthy();

    const requested = await apiPost(page, "/api/subscription/request", {
      billing_cycle: "monthly",
      request_type: "new",
      currency: "DZD",
      custom: { feature_keys: ["pos"], seats: 1 },
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
    expect(minted!.features.map((f) => f.feature?.key)).toEqual(["pos"]);
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

    const plans = await apiGet(page, "/api/subscription/plans");
    const first = (plans.body.plans as unknown as { id: string }[])[0];

    const both = await apiPost(page, "/api/subscription/request", {
      plan_id: first.id,
      billing_cycle: "monthly",
      request_type: "new",
      currency: "DZD",
      custom: { feature_keys: ["pos"], seats: 1 },
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

    // Module prices carry no currency and nothing converts them. Minting a plan
    // labelled EUR off dinar figures would be wrong by the exchange rate, and
    // wrong quietly, every month.
    const refused = await apiPost(page, "/api/subscription/request", {
      billing_cycle: "monthly",
      request_type: "new",
      currency: "EUR",
      custom: { feature_keys: ["pos"], seats: 1 },
    });
    expect(refused.status, JSON.stringify(refused.body)).toBe(400);
    expect(refused.body.code).toBe("CURRENCY_NOT_COMPOSABLE");
    // And it says which currency composing does work in.
    expect(refused.body.currency).toBe("DZD");
  });

  test("composing fewer seats than the team has is refused", async ({ page }) => {
    await signUp(page);
    await verifyEmail(page);

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
      custom: { feature_keys: ["pos"], seats: 1 },
    });
    expect(refused.status, JSON.stringify(refused.body)).toBe(409);
    expect(refused.body.code).toBe("SEATS_EXCEEDED");
    expect(refused.body.excess).toBe(2);
  });
});
