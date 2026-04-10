import { test, expect } from "@playwright/test";
import { signUp, logOut, logIn } from "./helpers";
import { apiGet, apiPost } from "./api-helpers";

test.describe("Role-based access control", () => {
  test("employee cannot create users (admin-only)", async ({ page }) => {
    // Sign up as admin
    await signUp(page);

    // Create an employee
    const emp = await apiPost(page, "/api/auth/users", {
      username: "employee_rbac",
      display_name: "Employee RBAC",
      password: "Employee123!",
      role: "employee",
      permissions: ["clients", "products"],
    });
    expect(emp.status).toBe(200);

    // Log out and log in as employee
    await logOut(page);
    await logIn(page, "employee_rbac", "Employee123!");

    // Employee should NOT be able to create users
    const res = await apiPost(page, "/api/auth/users", {
      username: "hacker_user",
      display_name: "Hacker",
      password: "Hacker123!",
      role: "employee",
    });
    expect(res.status).toBe(403);
  });

  test("employee can access permitted resources", async ({ page }) => {
    await signUp(page);

    await apiPost(page, "/api/auth/users", {
      username: "permitted_emp",
      display_name: "Permitted Employee",
      password: "Employee123!",
      role: "employee",
      permissions: ["clients", "products"],
    });

    await logOut(page);
    await logIn(page, "permitted_emp", "Employee123!");

    // Should be able to access clients and products
    const clients = await apiGet(page, "/api/clients");
    expect(clients.status).toBe(200);

    const products = await apiGet(page, "/api/products");
    expect(products.status).toBe(200);
  });

  test("user list is admin-only for creation", async ({ page }) => {
    await signUp(page);

    // Admin can list users
    const users = await apiGet(page, "/api/auth/users");
    expect(users.status).toBe(200);
    expect(Array.isArray(users.body)).toBe(true);
    expect((users.body as unknown as unknown[]).length).toBeGreaterThanOrEqual(1);
  });

  test("employee user has correct limited permissions", async ({ page }) => {
    await signUp(page);

    const emp = await apiPost(page, "/api/auth/users", {
      username: "check_perms_emp",
      display_name: "Perms Employee",
      password: "Employee123!",
      role: "employee",
      permissions: ["clients", "invoices"],
    });
    expect(emp.status).toBe(200);
    expect(emp.body.role).toBe("employee");
    const perms = emp.body.permissions as string[];
    expect(perms).toContain("clients");
    expect(perms).toContain("invoices");
    expect(perms).not.toContain("settings");
    expect(perms).not.toContain("pos");
  });
});
