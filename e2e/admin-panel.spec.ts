import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";
import { setupPlatformAdmin, adminGet, adminPost, adminPut, adminDelete } from "./admin-helpers";

test.describe("Admin panel", () => {
  test.beforeEach(async ({ page }) => {
    // Need a page context — navigate to app first
    await page.goto("/en/login");
    await page.waitForLoadState("networkidle");
  });

  test("admin auth: login, me, logout", async ({ page }) => {
    const admin = await setupPlatformAdmin(page);

    // GET /api/admin/auth/me
    const me = await adminGet(page, "/api/admin/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.username).toBe(admin.username);
    expect(me.body.role).toBe("super_admin");

    // Logout
    const logout = await adminPost(page, "/api/admin/auth/logout");
    expect(logout.status).toBe(200);

    // Should be unauthorized after logout
    const meAfter = await adminGet(page, "/api/admin/auth/me");
    expect(meAfter.status).toBe(401);
  });

  test("admin login rejects wrong password", async ({ page }) => {
    await setupPlatformAdmin(page);
    // Logout first
    await adminPost(page, "/api/admin/auth/logout");

    const login = await adminPost(page, "/api/admin/auth/login", {
      username: "nonexistent_admin",
      password: "wrong",
    });
    expect(login.status).toBe(401);
  });

  test("admin unauthenticated access returns 401", async ({ page }) => {
    const res = await adminGet(page, "/api/admin/tenants");
    expect(res.status).toBe(401);
  });
});

test.describe("Admin: tenants", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/en/login");
    await page.waitForLoadState("networkidle");
  });

  test("list tenants", async ({ page }) => {
    // Create a tenant first via signup
    await signUp(page);

    // Now set up admin and check tenants
    await setupPlatformAdmin(page);

    const tenants = await adminGet(page, "/api/admin/tenants");
    expect(tenants.status).toBe(200);
    expect(Array.isArray(tenants.body)).toBe(true);
    expect((tenants.body as unknown as unknown[]).length).toBeGreaterThanOrEqual(1);
  });

  test("get single tenant detail", async ({ page }) => {
    await signUp(page);
    await setupPlatformAdmin(page);

    const tenants = await adminGet(page, "/api/admin/tenants");
    const firstTenant = (tenants.body as unknown as Array<Record<string, unknown>>)[0];

    const detail = await adminGet(page, `/api/admin/tenants/${firstTenant.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.id).toBe(firstTenant.id);
    expect(detail.body.users).toBeDefined();
    expect(detail.body.company_settings).toBeDefined();
  });

  test("activate and suspend tenant", async ({ page }) => {
    await signUp(page);
    await setupPlatformAdmin(page);

    const tenants = await adminGet(page, "/api/admin/tenants");
    const tenant = (tenants.body as unknown as Array<Record<string, unknown>>)[0];

    // Activate
    const activated = await adminPost(page, `/api/admin/tenants/${tenant.id}/activate`);
    expect(activated.status).toBe(200);
    expect(activated.body.status).toBe("active");

    // Suspend
    const suspended = await adminPost(page, `/api/admin/tenants/${tenant.id}/suspend`);
    expect(suspended.status).toBe(200);
    expect(suspended.body.status).toBe("suspended");
  });

  test("update tenant name", async ({ page }) => {
    await signUp(page);
    await setupPlatformAdmin(page);

    const tenants = await adminGet(page, "/api/admin/tenants");
    const tenant = (tenants.body as unknown as Array<Record<string, unknown>>)[0];

    const updated = await adminPut(page, `/api/admin/tenants/${tenant.id}`, {
      name: "Renamed Tenant",
    });
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe("Renamed Tenant");
  });
});

test.describe("Admin: plans", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/en/login");
    await page.waitForLoadState("networkidle");
  });

  test("create, read, update, delete plan", async ({ page }) => {
    await setupPlatformAdmin(page);

    // Create
    const plan = await adminPost(page, "/api/admin/plans", {
      slug: `test-plan-${Date.now()}`,
      name: "Test Plan",
      description: "A test plan",
      monthly_price: 1000,
      yearly_price: 10000,
      currency: "DZD",
      trial_days: 7,
    });
    expect(plan.status).toBe(201);
    expect(plan.body.name).toBe("Test Plan");
    expect(plan.body.monthly_price).toBe(1000);

    // Read list
    const list = await adminGet(page, "/api/admin/plans");
    expect(list.status).toBe(200);
    expect((list.body as unknown as unknown[]).length).toBeGreaterThanOrEqual(1);

    // Read single
    const single = await adminGet(page, `/api/admin/plans/${plan.body.id}`);
    expect(single.status).toBe(200);
    expect(single.body.slug).toBe(plan.body.slug);

    // Update
    const updated = await adminPut(page, `/api/admin/plans/${plan.body.id}`, {
      name: "Updated Plan",
      monthly_price: 2000,
    });
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe("Updated Plan");
    expect(updated.body.monthly_price).toBe(2000);

    // Delete (soft delete — sets isActive to false)
    const del = await adminDelete(page, `/api/admin/plans/${plan.body.id}`);
    expect(del.status).toBe(204);
  });

  test("create plan with quotas", async ({ page }) => {
    await setupPlatformAdmin(page);

    const plan = await adminPost(page, "/api/admin/plans", {
      slug: `quota-plan-${Date.now()}`,
      name: "Quota Plan",
      monthly_price: 500,
      yearly_price: 5000,
      quotas: [
        { quota_key: "max_users", limit_value: 5 },
        { quota_key: "max_invoices_month", limit_value: 100 },
      ],
    });
    expect(plan.status).toBe(201);
    const quotas = plan.body.quotas as Array<Record<string, unknown>>;
    expect(quotas).toHaveLength(2);
  });
});

test.describe("Admin: coupons", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/en/login");
    await page.waitForLoadState("networkidle");
  });

  test("create, read, update coupon", async ({ page }) => {
    await setupPlatformAdmin(page);

    const code = `TESTCOUPON${Date.now()}`;

    // Create
    const coupon = await adminPost(page, "/api/admin/coupons", {
      code,
      discount_type: "percentage",
      discount_value: 20,
      max_uses: 100,
      is_active: true,
    });
    expect(coupon.status).toBe(201);
    expect(coupon.body.code).toBe(code);
    expect(coupon.body.discount_type).toBe("percentage");
    expect(coupon.body.discount_value).toBe(20);

    // Read list
    const list = await adminGet(page, "/api/admin/coupons");
    expect(list.status).toBe(200);

    // Read single
    const single = await adminGet(page, `/api/admin/coupons/${coupon.body.id}`);
    expect(single.status).toBe(200);

    // Update
    const updated = await adminPut(page, `/api/admin/coupons/${coupon.body.id}`, {
      discount_value: 30,
    });
    expect(updated.status).toBe(200);
    expect(updated.body.discount_value).toBe(30);

    // Deactivate (soft delete)
    const del = await adminDelete(page, `/api/admin/coupons/${coupon.body.id}`);
    expect(del.status).toBe(204);
  });

  test("create fixed-amount coupon", async ({ page }) => {
    await setupPlatformAdmin(page);

    const coupon = await adminPost(page, "/api/admin/coupons", {
      code: `FIXED${Date.now()}`,
      discount_type: "fixed",
      discount_value: 500,
      currency: "DZD",
    });
    expect(coupon.status).toBe(201);
    expect(coupon.body.discount_type).toBe("fixed");
  });
});

test.describe("Admin: feature flags", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/en/login");
    await page.waitForLoadState("networkidle");
  });

  test("create, read, update feature flag", async ({ page }) => {
    await setupPlatformAdmin(page);

    const key = `test_feature_${Date.now()}`;

    // Create
    const feature = await adminPost(page, "/api/admin/features", {
      key,
      name: "Test Feature",
      description: "A test feature flag",
      is_global: true,
    });
    expect(feature.status).toBe(201);
    expect(feature.body.key).toBe(key);
    expect(feature.body.is_global).toBe(true);

    // Read list
    const list = await adminGet(page, "/api/admin/features");
    expect(list.status).toBe(200);

    // Read single
    const single = await adminGet(page, `/api/admin/features/${feature.body.id}`);
    expect(single.status).toBe(200);

    // Update
    const updated = await adminPut(page, `/api/admin/features/${feature.body.id}`, {
      name: "Updated Feature",
      is_global: false,
    });
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe("Updated Feature");
    expect(updated.body.is_global).toBe(false);
  });
});

test.describe("Admin: announcements", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/en/login");
    await page.waitForLoadState("networkidle");
  });

  test("create, read, update, delete announcement", async ({ page }) => {
    await setupPlatformAdmin(page);

    // Create
    const ann = await adminPost(page, "/api/admin/announcements", {
      title: "Test Announcement",
      body: "This is a test announcement.",
      target_type: "all",
    });
    expect(ann.status).toBe(201);
    expect(ann.body.title).toBe("Test Announcement");

    // Read list
    const list = await adminGet(page, "/api/admin/announcements");
    expect(list.status).toBe(200);

    // Read single
    const single = await adminGet(page, `/api/admin/announcements/${ann.body.id}`);
    expect(single.status).toBe(200);

    // Update
    const updated = await adminPut(page, `/api/admin/announcements/${ann.body.id}`, {
      title: "Updated Announcement",
    });
    expect(updated.status).toBe(200);
    expect(updated.body.title).toBe("Updated Announcement");

    // Delete
    const del = await adminDelete(page, `/api/admin/announcements/${ann.body.id}`);
    expect(del.status).toBe(204);
  });
});

test.describe("Admin: platform admins", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/en/login");
    await page.waitForLoadState("networkidle");
  });

  test("list and create platform admins", async ({ page }) => {
    await setupPlatformAdmin(page);

    // List
    const list = await adminGet(page, "/api/admin/platform-admins");
    expect(list.status).toBe(200);
    expect((list.body as unknown as unknown[]).length).toBeGreaterThanOrEqual(1);

    // Create new support agent
    const agent = await adminPost(page, "/api/admin/platform-admins", {
      username: `agent_${Date.now()}`,
      email: `agent_${Date.now()}@test.local`,
      password: "Agent123!",
      display_name: "Support Agent",
      role: "support_agent",
    });
    expect(agent.status).toBe(201);
    expect(agent.body.role).toBe("support_agent");
  });

  test("duplicate username rejected", async ({ page }) => {
    const admin = await setupPlatformAdmin(page);

    const dup = await adminPost(page, "/api/admin/platform-admins", {
      username: admin.username,
      email: "different@test.local",
      password: "Dup123!",
    });
    expect(dup.status).toBe(409);
  });
});

test.describe("Admin: analytics & system", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/en/login");
    await page.waitForLoadState("networkidle");
  });

  test("analytics overview", async ({ page }) => {
    await signUp(page); // create some data
    await setupPlatformAdmin(page);

    const overview = await adminGet(page, "/api/admin/analytics/overview");
    expect(overview.status).toBe(200);
    expect(overview.body.total_tenants).toBeGreaterThanOrEqual(1);
    expect(overview.body.total_users).toBeGreaterThanOrEqual(1);
    expect(typeof overview.body.mrr).toBe("number");
    expect(overview.body.subscription_breakdown).toBeDefined();
  });

  test("system health check", async ({ page }) => {
    await setupPlatformAdmin(page);

    const health = await adminGet(page, "/api/admin/system/health");
    expect(health.status).toBe(200);
    expect(health.body.db_connected).toBe(true);
    expect(typeof health.body.uptime).toBe("number");
    expect(typeof health.body.total_tenants).toBe("number");
  });

  test("audit logs", async ({ page }) => {
    await setupPlatformAdmin(page);

    // Do an action that creates an audit log (create a plan)
    await adminPost(page, "/api/admin/plans", {
      slug: `audit-plan-${Date.now()}`,
      name: "Audit Plan",
      monthly_price: 100,
      yearly_price: 1000,
    });

    const logs = await adminGet(page, "/api/admin/audit-logs");
    expect(logs.status).toBe(200);
    expect(logs.body.data).toBeDefined();
    expect(logs.body.total).toBeGreaterThanOrEqual(1);
  });
});

test.describe("Admin: data requests", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/en/login");
    await page.waitForLoadState("networkidle");
  });

  test("create and list data requests", async ({ page }) => {
    await signUp(page);
    await setupPlatformAdmin(page);

    // Get a tenant ID
    const tenants = await adminGet(page, "/api/admin/tenants");
    const tenant = (tenants.body as unknown as Array<Record<string, unknown>>)[0];

    // Create export request
    const req = await adminPost(page, "/api/admin/data-requests", {
      tenant_id: tenant.id,
      request_type: "export",
      notes: "Test export",
    });
    expect(req.status).toBe(201);
    expect(req.body.request_type).toBe("export");
    expect(req.body.status).toBe("completed"); // export processes immediately

    // List
    const list = await adminGet(page, "/api/admin/data-requests");
    expect(list.status).toBe(200);
    expect((list.body as unknown as unknown[]).length).toBeGreaterThanOrEqual(1);
  });
});

test.describe("Admin: subscription requests", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/en/login");
    await page.waitForLoadState("networkidle");
  });

  test("list subscription requests", async ({ page }) => {
    await setupPlatformAdmin(page);

    const list = await adminGet(page, "/api/admin/subscription-requests");
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
  });
});
