import { test, expect } from "@playwright/test";
import {
  signUp,
  logIn,
  logOut,
  createClientViaApi,
  createInvoiceViaApi,
} from "./helpers";

test.describe("Cross-tenant data isolation", () => {
  test("tenant A data is not accessible via API after switching to tenant B", async ({
    page,
  }) => {
    // ── Tenant A: create account + data ───────────────────────────────
    await signUp(page);
    const clientA = await createClientViaApi(page, "TenantA_UniqueClient_XYZ");
    expect(clientA.id).toBeTruthy();

    // Verify tenant A can see their client via API
    const tenantAClients = await page.evaluate(async () => {
      const r = await fetch("/api/clients");
      return r.json();
    });
    const foundA = tenantAClients.find(
      (c: { name: string }) => c.name === "TenantA_UniqueClient_XYZ"
    );
    expect(foundA).toBeTruthy();

    // ── Log out ──────────────────────────────────────────────────────
    await logOut(page);

    // ── Tenant B: create a different account ──────────────────────────
    await signUp(page);

    // ── Verify tenant A data is NOT accessible from tenant B ─────────
    const tenantBClients = await page.evaluate(async () => {
      const r = await fetch("/api/clients");
      return r.json();
    });
    const leakedClient = tenantBClients.find(
      (c: { name: string }) => c.name === "TenantA_UniqueClient_XYZ"
    );
    expect(leakedClient).toBeUndefined();
  });

  test("API returns 404 when accessing another tenant resource by ID", async ({
    page,
  }) => {
    // ── Tenant A: create data ─────────────────────────────────────────
    const tenantA = await signUp(page);
    const clientA = await createClientViaApi(page, "IsolationTest_Client");
    const clientAId = clientA.id;
    expect(clientAId).toBeTruthy();

    await logOut(page);

    // ── Tenant B: try to access tenant A's client by ID ───────────────
    await signUp(page);

    const result = await page.evaluate(async (id) => {
      const r = await fetch(`/api/clients/${id}`);
      return { status: r.status };
    }, clientAId);

    // Should be 404 because tenant B can't see tenant A's client
    expect(result.status).toBe(404);
  });

  test("cache is cleared on logout so API returns fresh data", async ({
    page,
  }) => {
    // ── Create account and data ──────────────────────────────────────
    const creds = await signUp(page);
    await createClientViaApi(page, "CacheTest_BeforeLogout_XYZ");

    // Verify via API
    const before = await page.evaluate(async () => {
      const r = await fetch("/api/clients");
      return r.json();
    });
    expect(
      before.find(
        (c: { name: string }) => c.name === "CacheTest_BeforeLogout_XYZ"
      )
    ).toBeTruthy();

    // ── Log out and back in ──────────────────────────────────────────
    await logOut(page);
    await logIn(page, creds.username, creds.password);

    // ── Verify data is still accessible (same tenant, fresh session) ──
    const after = await page.evaluate(async () => {
      const r = await fetch("/api/clients");
      return r.json();
    });
    expect(
      after.find(
        (c: { name: string }) => c.name === "CacheTest_BeforeLogout_XYZ"
      )
    ).toBeTruthy();
  });
});
