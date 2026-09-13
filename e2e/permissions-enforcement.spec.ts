import { test, expect, type Page } from "@playwright/test";
import { logOut, logIn } from "./helpers";
import { apiGet, apiPost, setupProduct } from "./api-helpers";
import { signUpSubscribed } from "./subscription-setup";

type Crud = { can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean };

/**
 * Create an employee with explicit per-module CRUD flags via the User
 * Management API (POST /api/auth/users with permission_details). Every employee
 * gets dashboard view so they land inside the app, plus the given products flags.
 */
async function createEmployee(page: Page, username: string, products: Crud) {
  const res = await apiPost(page, "/api/auth/users", {
    username,
    display_name: username,
    password: "Employee123!",
    role: "employee",
    permission_details: [
      { key: "dashboard", can_view: true, can_create: false, can_edit: false, can_delete: false },
      { key: "products", ...products },
    ],
  });
  expect(res.status).toBe(200);
  return res;
}

async function gotoProducts(page: Page) {
  await page.goto("/en/products");
  await page.waitForLoadState("networkidle");
}

const PRODUCT_BODY = {
  designation: "Direct API Product",
  unit_price: 10,
  tax_rate: 20,
  unit: "unit",
  is_service: false,
};

test.describe("Products permission enforcement", () => {
  test("view-only employee: affordances hidden + writes blocked; full employee + admin unaffected", async ({
    page,
  }) => {
    const admin = await signUpSubscribed(page);

    // Unique per run. These were fixed names, and usernames are unique per
    // tenant but not globally: forty runs had left forty `emp_viewonly`
    // accounts across forty abandoned tenants, and logging in resolved to an
    // arbitrary one. It passed for as long as that tenant's trial was still
    // running, then started reporting demo data — a test failing for a reason
    // that has nothing to do with what it checks.
    const stamp = Date.now();
    const viewOnly = `emp_viewonly_${stamp}`;
    const fullCrud = `emp_fullcrud_${stamp}`;

    // Seed a product so every role has a visible row to reason about.
    await setupProduct(page, "Perm Widget", 500);

    // ── ADMIN sees everything ────────────────────────────────────────────
    await gotoProducts(page);
    // Target the desktop table cell: the products list also renders a mobile
    // card view (md:hidden) whose <p> would match getByText but is hidden.
    // Generous timeout: this first load also settles the subscription refetch.
    await expect(
      page.getByRole("cell", { name: "Perm Widget" })
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "New Product" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit" }).first()).toBeVisible();

    // ── Create two employees with different products permissions ──────────
    await createEmployee(page, viewOnly, {
      can_view: true,
      can_create: false,
      can_edit: false,
      can_delete: false,
    });
    await createEmployee(page, fullCrud, {
      can_view: true,
      can_create: true,
      can_edit: true,
      can_delete: true,
    });

    // ── VIEW-ONLY employee ───────────────────────────────────────────────
    await logOut(page);
    await logIn(page, viewOnly, "Employee123!");
    await gotoProducts(page);
    // The list itself renders (view granted). Desktop table cell, as above.
    await expect(
      page.getByRole("cell", { name: "Perm Widget" })
    ).toBeVisible({ timeout: 15_000 });
    // But create/edit/delete affordances are hidden.
    await expect(page.getByRole("button", { name: "New Product" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);

    // Server enforcement: products GET allowed (view granted), POST forbidden.
    expect((await apiGet(page, "/api/products")).status).toBe(200);
    expect((await apiPost(page, "/api/products", PRODUCT_BODY)).status).toBe(403);

    // View is enforced server-side on document reads too: this employee has no
    // "invoices" permission, so reading invoices is forbidden (not just hidden).
    expect((await apiGet(page, "/api/invoices")).status).toBe(403);

    // ── FULL-CRUD employee (no over-gating) ──────────────────────────────
    await logOut(page);
    await logIn(page, fullCrud, "Employee123!");
    await gotoProducts(page);
    await expect(page.getByRole("button", { name: "New Product" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit" }).first()).toBeVisible();
    // Server allows the write.
    expect((await apiPost(page, "/api/products", PRODUCT_BODY)).status).toBe(200);

    // ── ADMIN again: full access via the API ─────────────────────────────
    await logOut(page);
    await logIn(page, admin.username, admin.password);
    expect((await apiPost(page, "/api/products", PRODUCT_BODY)).status).toBe(200);
    expect((await apiGet(page, "/api/products")).status).toBe(200);
  });
});
