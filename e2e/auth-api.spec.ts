import { test, expect } from "@playwright/test";
import { signUp, logOut, logIn } from "./helpers";
import { apiGet, apiPost } from "./api-helpers";

test.describe("Auth API flows", () => {
  test("API returns 401 when not authenticated", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/en/login");

    const res = await apiGet(page, "/api/clients");
    expect(res.status).toBe(401);
  });

  test("signup creates tenant, user, and settings", async ({ page }) => {
    await signUp(page);

    // Should be able to access settings
    const settings = await apiGet(page, "/api/settings");
    expect(settings.status).toBe(200);
    expect(settings.body.company_name).toBeTruthy();

    // Should be able to access auth/me
    const me = await apiGet(page, "/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.username).toBeTruthy();
    expect(me.body.role).toBe("admin");
    expect(me.body.permissions).toBeTruthy();
  });

  test("new admin has all permissions", async ({ page }) => {
    await signUp(page);

    const me = await apiGet(page, "/api/auth/me");
    const permissions = me.body.permissions as string[];
    expect(permissions).toContain("dashboard");
    expect(permissions).toContain("clients");
    expect(permissions).toContain("products");
    expect(permissions).toContain("invoices");
    expect(permissions).toContain("quotes");
    expect(permissions).toContain("pos");
    expect(permissions).toContain("settings");
  });

  test("duplicate username returns 409", async ({ page }) => {
    const creds = await signUp(page);
    await logOut(page);

    // Try to sign up with same username via API
    const res = await apiPost(page, "/api/auth/signup", {
      company_name: "Different Company",
      username: creds.username,
      display_name: "Another User",
      password: "Password123!",
    });
    expect(res.status).toBe(409);
  });

  test("login with valid credentials returns user data", async ({ page }) => {
    const creds = await signUp(page);
    await logOut(page);

    const login = await apiPost(page, "/api/auth/login", {
      username: creds.username,
      password: creds.password,
    });
    expect(login.status).toBe(200);
    expect(login.body.username).toBe(creds.username);
    expect(login.body.role).toBe("admin");
  });

  test("login with wrong password returns 401", async ({ page }) => {
    const creds = await signUp(page);
    await logOut(page);

    const login = await apiPost(page, "/api/auth/login", {
      username: creds.username,
      password: "WrongPassword!",
    });
    expect(login.status).toBe(401);
  });

  test("login with non-existent user returns 401", async ({ page }) => {
    await page.goto("/en/login");
    const login = await apiPost(page, "/api/auth/login", {
      username: "nonexistent_user_xyz",
      password: "anything",
    });
    expect(login.status).toBe(401);
  });

  test("session persists across requests", async ({ page }) => {
    await signUp(page);

    // Multiple API calls should all work
    const clients = await apiGet(page, "/api/clients");
    const products = await apiGet(page, "/api/products");
    const settings = await apiGet(page, "/api/settings");

    expect(clients.status).toBe(200);
    expect(products.status).toBe(200);
    expect(settings.status).toBe(200);
  });

  test("logout invalidates session", async ({ page }) => {
    await signUp(page);

    // Verify authenticated
    let res = await apiGet(page, "/api/clients");
    expect(res.status).toBe(200);

    // Logout
    await logOut(page);

    // Should now fail
    res = await apiGet(page, "/api/clients");
    expect(res.status).toBe(401);
  });

  test("create employee user and verify limited role", async ({ page }) => {
    await signUp(page);

    const user = await apiPost(page, "/api/auth/users", {
      username: "employee1",
      display_name: "Employee One",
      password: "Employee123!",
      role: "employee",
      permissions: ["clients", "products"],
    });

    expect(user.status).toBe(200);
    expect(user.body.role).toBe("employee");
  });
});
