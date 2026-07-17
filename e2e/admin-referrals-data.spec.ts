import { test, expect, type Page } from "@playwright/test";
import { signUp } from "./helpers";
import { setupPlatformAdmin, adminGet, adminPost, adminPut } from "./admin-helpers";

type AnyRecord = Record<string, unknown>;

async function tenantByName(page: Page, name: string) {
  const res = await adminGet(page, "/api/admin/tenants");
  const found = (res.body as unknown as AnyRecord[]).find((t) => t.name === name);
  expect(found, `tenant "${name}" should exist`).toBeTruthy();
  return found as AnyRecord;
}

/**
 * Navigate to the login page with the PWA service worker disabled. The real SW
 * calls clients.claim() then reloads the page via a controllerchange handler,
 * which can destroy an in-flight page.evaluate (setupPlatformAdmin) and produce
 * spurious "Failed to fetch" / "Execution context was destroyed" errors. These
 * specs don't exercise offline behavior, so stubbing SW registration keeps setup
 * deterministic. The init script also applies to later same-context navigations.
 */
async function gotoLoginStable(page: Page) {
  await page.addInitScript(() => {
    try {
      const sw = navigator.serviceWorker;
      if (sw) {
        const proto = Object.getPrototypeOf(sw) as ServiceWorkerContainer;
        proto.register = () =>
          Promise.reject(new Error("service worker disabled for e2e"));
      }
    } catch {
      /* ignore */
    }
  });
  await page.goto("/en/login");
  await page.waitForLoadState("networkidle");
}

test.describe("Admin referrals", () => {
  test.beforeEach(async ({ page }) => {
    await gotoLoginStable(page);
  });

  test("create a referral code for a tenant, then toggle it off and on", async ({ page }) => {
    const { company } = await signUp(page);
    await setupPlatformAdmin(page);
    const tenant = await tenantByName(page, company);

    // Create (auto-generated code).
    const created = await adminPost(page, "/api/admin/referrals", {
      tenant_id: tenant.id,
    });
    expect(created.status).toBe(201);
    expect(created.body.is_active).toBe(true);
    expect(String(created.body.code)).toMatch(/^REF-/);
    const codeId = created.body.id as string;

    // A tenant can only have one code.
    const dup = await adminPost(page, "/api/admin/referrals", { tenant_id: tenant.id });
    expect(dup.status).toBe(409);

    // Toggle OFF.
    const off = await adminPost(page, "/api/admin/referrals/toggle", {
      id: codeId,
      is_active: false,
    });
    expect(off.status).toBe(200);
    expect(off.body.is_active).toBe(false);

    // Toggle ON.
    const on = await adminPost(page, "/api/admin/referrals/toggle", {
      id: codeId,
      is_active: true,
    });
    expect(on.status).toBe(200);
    expect(on.body.is_active).toBe(true);
  });
});

test.describe("Admin data requests", () => {
  test.beforeEach(async ({ page }) => {
    await gotoLoginStable(page);
  });

  test("create a deletion request and advance its status", async ({ page }) => {
    const { company } = await signUp(page);
    await setupPlatformAdmin(page);
    const tenant = await tenantByName(page, company);

    const created = await adminPost(page, "/api/admin/data-requests", {
      tenant_id: tenant.id,
      request_type: "deletion",
      notes: "e2e deletion request",
    });
    expect(created.status).toBe(201);
    expect(created.body.request_type).toBe("deletion");
    // Deletion requests start in "processing" (they are not auto-executed).
    expect(created.body.status).toBe("processing");
    const id = created.body.id as string;

    const completed = await adminPut(page, `/api/admin/data-requests/${id}`, {
      status: "completed",
    });
    expect(completed.status).toBe(200);
    expect(completed.body.status).toBe("completed");
    expect(completed.body.completed_at).toBeTruthy();
  });

  test("execute deletion permanently removes the tenant", async ({ page }) => {
    const { company } = await signUp(page);
    await setupPlatformAdmin(page);
    const tenant = await tenantByName(page, company);
    const tenantId = tenant.id as string;

    const req = await adminPost(page, "/api/admin/data-requests", {
      tenant_id: tenantId,
      request_type: "deletion",
    });
    expect(req.status).toBe(201);

    const exec = await adminPost(page, `/api/admin/data-requests/${req.body.id}/execute`);
    expect(exec.status).toBe(200);
    expect(exec.body.success).toBe(true);
    expect(exec.body.tenant_id).toBe(tenantId);

    // Tenant (and all its data) is gone.
    const gone = await adminGet(page, `/api/admin/tenants/${tenantId}`);
    expect(gone.status).toBe(404);
  });

  test("execute rejects a non-deletion (export) request", async ({ page }) => {
    const { company } = await signUp(page);
    await setupPlatformAdmin(page);
    const tenant = await tenantByName(page, company);

    const exportReq = await adminPost(page, "/api/admin/data-requests", {
      tenant_id: tenant.id,
      request_type: "export",
    });
    expect(exportReq.status).toBe(201);

    const exec = await adminPost(
      page,
      `/api/admin/data-requests/${exportReq.body.id}/execute`
    );
    expect(exec.status).toBe(400);
    expect(String(exec.body.error)).toContain("deletion");
  });

  test("execute-deletion modal requires typed tenant-name confirmation (UI)", async ({ page }) => {
    const { company } = await signUp(page);
    await setupPlatformAdmin(page);
    const tenant = await tenantByName(page, company);

    await adminPost(page, "/api/admin/data-requests", {
      tenant_id: tenant.id,
      request_type: "deletion",
    });

    await page.goto("/en/admin/data-requests");

    // Open the execute-deletion modal from our tenant's row.
    await page
      .locator("tr", { hasText: company })
      .getByRole("button", { name: "Execute deletion" })
      .first()
      .click();

    // The modal's confirm button is the last one in the DOM.
    const confirmBtn = page.getByRole("button", { name: "Execute deletion" }).last();
    const nameInput = page.locator('input[name="confirm-tenant-name"]');
    await expect(nameInput).toBeVisible();

    // Disabled until the exact tenant name is typed.
    await expect(confirmBtn).toBeDisabled();
    await nameInput.fill("definitely not the name");
    await expect(confirmBtn).toBeDisabled();
    await nameInput.fill(company);
    await expect(confirmBtn).toBeEnabled();

    // Close without actually deleting.
    await page.keyboard.press("Escape");
  });
});
