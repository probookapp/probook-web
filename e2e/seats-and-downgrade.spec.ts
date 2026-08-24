import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";
import { apiGet, apiPost } from "./api-helpers";
import { setupPlatformAdmin, adminGet, adminPost, createTestPlan } from "./admin-helpers";

/**
 * Seats, and what happens when a business asks for an offer it no longer fits.
 *
 * Three behaviours were possible and only one of them keeps both halves of the
 * promise. Keeping every account and freezing new ones destroys the reason to
 * pay: a three-person business drops to the single-seat offer and keeps its
 * three people. Deactivating the excess automatically is how a business loses
 * the account its accountant was using, on a Friday, chosen by nobody.
 *
 * So the move is refused, and the refusal says exactly what it would take. The
 * person who knows the team decides about the team.
 */

/** The tenant behind a signup, as the admin panel resolves it. */
async function tenantIdFor(page: import("@playwright/test").Page, company: string) {
  const res = await adminGet(page, `/api/admin/tenants?search=${encodeURIComponent(company)}`);
  const found = (res.body as unknown as { id: string; name: string }[]).find(
    (t) => t.name === company
  );
  expect(found, `tenant "${company}" should exist`).toBeTruthy();
  return found!.id;
}

/** An offer with a seat ceiling, created the way the admin panel creates one. */
async function planWithSeats(page: import("@playwright/test").Page, seats: number | null) {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const body: Record<string, unknown> = {
    slug: `seats-${seats ?? "unlimited"}-${suffix}`,
    name: `Seats ${seats ?? "unlimited"} ${suffix}`,
    monthly_price: 100_000,
    yearly_price: 1_000_000,
    currency: "DZD",
  };
  if (seats !== null) {
    body.quotas = [{ quota_key: "max_users", limit_value: seats }];
  }
  const created = await createTestPlan(page, body);
  // The plans route answers 201 on create.
  expect(created.status, JSON.stringify(created.body).slice(0, 300)).toBe(201);
  return created.body as unknown as { id: string };
}

test.describe("seat ceilings", () => {
  test("an offer that covers fewer people than the business has is refused, and says how many", async ({
    page,
  }) => {
    const creds = await signUp(page);

    // Three people: the owner and two employees.
    for (const n of [1, 2]) {
      const created = await apiPost(page, "/api/auth/users", {
        username: `employe${n}_${Date.now()}`,
        display_name: `Employé ${n}`,
        password: "Test1234!",
        role: "employee",
      });
      expect(created.status, JSON.stringify(created.body)).toBe(200);
    }

    await setupPlatformAdmin(page);
    const tenantId = await tenantIdFor(page, creds.company);
    const single = await planWithSeats(page, 1);

    const refused = await adminPost(page, "/api/admin/subscriptions", {
      tenant_id: tenantId,
      plan_id: single.id,
      billing_cycle: "yearly",
    });
    expect(refused.status, JSON.stringify(refused.body)).toBe(409);
    expect(refused.body.code).toBe("SEATS_EXCEEDED");
    // The numbers are in the payload, not only in the sentence: an admin screen
    // has to be able to say "deactivate two" without parsing English.
    expect(refused.body.active).toBe(3);
    expect(refused.body.limit).toBe(1);
    expect(refused.body.excess).toBe(2);
    expect(String(refused.body.error)).toContain("3 active");

  });

  test("seats sold on the subscription override the offer's ceiling", async ({ page }) => {
    const creds = await signUp(page);

    for (const n of [1, 2]) {
      await apiPost(page, "/api/auth/users", {
        username: `emp${n}_${Date.now()}`,
        display_name: `Employé ${n}`,
        password: "Test1234!",
        role: "employee",
      });
    }

    await setupPlatformAdmin(page);
    const tenantId = await tenantIdFor(page, creds.company);
    const single = await planWithSeats(page, 1);

    // The same move that was refused above goes through once the seats are
    // bought — which is the whole point of the column: selling one extra seat
    // must not mean minting a private offer for that one customer.
    const sold = await adminPost(page, "/api/admin/subscriptions", {
      tenant_id: tenantId,
      plan_id: single.id,
      billing_cycle: "yearly",
      seats: 3,
    });
    expect(sold.status, JSON.stringify(sold.body).slice(0, 300)).toBe(201);
    expect(sold.body.seats).toBe(3);
  });

  test("the business is held to the seats it bought, not the offer's figure", async ({ page }) => {
    const creds = await signUp(page);

    await setupPlatformAdmin(page);
    const tenantId = await tenantIdFor(page, creds.company);
    // An offer that would allow ten, capped at two by the subscription.
    const roomy = await planWithSeats(page, 10);
    const sub = await adminPost(page, "/api/admin/subscriptions", {
      tenant_id: tenantId,
      plan_id: roomy.id,
      billing_cycle: "yearly",
      seats: 2,
    });
    expect(sub.status, JSON.stringify(sub.body).slice(0, 300)).toBe(201);

    // The tenant session cookie survives the admin login — they are separate
    // cookies — so the calls below still speak as the business.
    // Second account fits the two seats.
    const second = await apiPost(page, "/api/auth/users", {
      username: `emp_${Date.now()}`,
      display_name: "Employé",
      password: "Test1234!",
      role: "employee",
    });
    expect(second.status, JSON.stringify(second.body)).toBe(200);

    // Third does not, even though the offer alone would have allowed ten.
    const third = await apiPost(page, "/api/auth/users", {
      username: `emp2_${Date.now()}`,
      display_name: "Employé 2",
      password: "Test1234!",
      role: "employee",
    });
    expect(third.status, JSON.stringify(third.body)).toBe(403);
    expect(third.body.code).toBe("USER_QUOTA_REACHED");
    // The ceiling quoted back is the one that was bought, not the offer's ten.
    expect(third.body.limit).toBe(2);
  });

  test("an unlimited offer refuses nobody", async ({ page }) => {
    const creds = await signUp(page);

    for (const n of [1, 2, 3]) {
      await apiPost(page, "/api/auth/users", {
        username: `libre${n}_${Date.now()}`,
        display_name: `Employé ${n}`,
        password: "Test1234!",
        role: "employee",
      });
    }

    await setupPlatformAdmin(page);
    const tenantId = await tenantIdFor(page, creds.company);
    const unlimited = await planWithSeats(page, null);
    const ok = await adminPost(page, "/api/admin/subscriptions", {
      tenant_id: tenantId,
      plan_id: unlimited.id,
      billing_cycle: "yearly",
    });
    expect(ok.status, JSON.stringify(ok.body).slice(0, 300)).toBe(201);
  });

  test("a deactivated account frees its seat, so the refusal is actionable", async ({ page }) => {
    const creds = await signUp(page);

    const employee = await apiPost(page, "/api/auth/users", {
      username: `partant_${Date.now()}`,
      display_name: "Partant",
      password: "Test1234!",
      role: "employee",
    });
    expect(employee.status).toBe(200);

    await setupPlatformAdmin(page);
    const tenantId = await tenantIdFor(page, creds.company);
    const single = await planWithSeats(page, 1);

    const before = await adminPost(page, "/api/admin/subscriptions", {
      tenant_id: tenantId,
      plan_id: single.id,
      billing_cycle: "yearly",
    });
    expect(before.status).toBe(409);
    expect(before.body.excess).toBe(1);

    // Deactivating is what the refusal asked for — and it has to actually work,
    // otherwise the message names a step nobody can take.
    const disabled = await adminPost(
      page,
      `/api/admin/users/${employee.body.id}/disable`,
      {}
    );
    expect(disabled.status, JSON.stringify(disabled.body)).toBe(200);
    expect(disabled.body.is_active).toBe(false);

    const after = await adminPost(page, "/api/admin/subscriptions", {
      tenant_id: tenantId,
      plan_id: single.id,
      billing_cycle: "yearly",
    });
    expect(after.status, JSON.stringify(after.body).slice(0, 300)).toBe(201);

  });

  test("platform staff cannot deactivate the business owner either", async ({ page }) => {
    await signUp(page);

    const roster = await apiGet(page, "/api/auth/users");
    const owner = (roster.body as unknown as { id: string; is_owner: boolean }[]).find(
      (u) => u.is_owner
    );
    expect(owner, "the signup account owns the business").toBeTruthy();

    await setupPlatformAdmin(page);
    // The tenant's own API already refuses this. Leaving the admin door open
    // would let a support action do exactly what that rule exists to prevent.
    const refused = await adminPost(page, `/api/admin/users/${owner!.id}/disable`, {});
    expect(refused.status, JSON.stringify(refused.body)).toBe(400);
    expect(refused.body.code).toBe("OWNER_PROTECTED");

    // And the account is still active: a refused call must not half-apply.
    const after = await apiGet(page, "/api/auth/users");
    const stillActive = (after.body as unknown as { id: string; is_active: boolean }[]).find(
      (u) => u.id === owner!.id
    );
    expect(stillActive?.is_active).toBe(true);
  });
});
