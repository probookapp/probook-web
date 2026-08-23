import { test, expect } from "@playwright/test";
import { signUp, logIn, logOut } from "./helpers";
import { apiGet, apiPost, apiPut, apiDelete } from "./api-helpers";

/**
 * The business owner cannot be locked out of their own business.
 *
 * Before this, the only guard anywhere refused to delete *your own* account,
 * which left the real accident open: an admin could demote the other admin,
 * then deactivate themselves, and the business was left with nobody able to add
 * a user, change a setting, or undo any of it. The way back was for platform
 * staff to impersonate them.
 *
 * The rule closes three doors with one idea — the account that created the
 * business keeps its keys — and pays for itself with a way to hand them over,
 * without which an owner who leaves the company would lock the business to
 * someone who is gone.
 */
test.describe("business owner", () => {
  test("the owner cannot be demoted, deactivated or deleted", async ({ page }) => {
    const creds = await signUp(page);

    const roster = await apiGet(page, "/api/auth/users");
    const users = roster.body as unknown as { id: string; username: string; is_owner: boolean }[];
    const owner = users.find((u) => u.username === creds.username);
    expect(owner, "the signup's account should be on the roster").toBeTruthy();
    expect(owner!.is_owner, "the account that signed up owns the business").toBe(true);

    const demoted = await apiPut(page, `/api/auth/users/${owner!.id}`, {
      username: creds.username,
      display_name: "Rétrogradé",
      role: "employee",
      is_active: true,
    });
    expect(demoted.status).toBe(400);
    expect(demoted.body.code).toBe("OWNER_PROTECTED");

    const deactivated = await apiPut(page, `/api/auth/users/${owner!.id}`, {
      username: creds.username,
      display_name: creds.username,
      role: "admin",
      is_active: false,
    });
    expect(deactivated.status).toBe(400);
    expect(deactivated.body.code).toBe("OWNER_PROTECTED");

    const deleted = await apiDelete(page, `/api/auth/users/${owner!.id}`);
    expect(deleted.status).toBe(400);

    // What an owner legitimately does to their own account still works: the rule
    // protects the keys, not the name on them.
    const renamed = await apiPut(page, `/api/auth/users/${owner!.id}`, {
      username: creds.username,
      display_name: "Gérant renommé",
      role: "admin",
      is_active: true,
    });
    expect(renamed.status).toBe(200);
  });

  test("the owner hands the business to another administrator, and nobody else can", async ({
    page,
  }) => {
    const creds = await signUp(page);
    const successorName = `successeur_${Date.now()}`;

    const employee = await apiPost(page, "/api/auth/users", {
      username: `employe_${Date.now()}`,
      display_name: "Employé",
      password: "Test1234!",
      role: "employee",
    });
    expect(employee.status).toBe(200);

    // An employee cannot be handed the business: it would put the keys in an
    // account that has none of the rights they unlock.
    const toEmployee = await apiPost(page, "/api/auth/owner", {
      user_id: employee.body.id,
    });
    expect(toEmployee.status).toBe(400);
    expect(toEmployee.body.code).toBe("TRANSFER_REFUSED");

    const successor = await apiPost(page, "/api/auth/users", {
      username: successorName,
      display_name: "Successeur",
      password: "Test1234!",
      role: "admin",
    });
    expect(successor.status).toBe(200);

    const handed = await apiPost(page, "/api/auth/owner", {
      user_id: successor.body.id,
    });
    expect(handed.status, JSON.stringify(handed.body)).toBe(200);
    expect(handed.body.owner_user_id).toBe(successor.body.id);

    // The former owner becomes an ordinary administrator — which is the whole
    // point of the transfer: the account can now be demoted or deactivated.
    const after = await apiGet(page, "/api/auth/users");
    const list = after.body as unknown as { username: string; is_owner: boolean }[];
    expect(list.find((u) => u.username === creds.username)!.is_owner).toBe(false);
    expect(list.find((u) => u.username === successorName)!.is_owner).toBe(true);

    // And the person who no longer owns it cannot take it back.
    const takeBack = await apiPost(page, "/api/auth/owner", { user_id: employee.body.id });
    expect(takeBack.status).toBe(403);
    expect(takeBack.body.code).toBe("NOT_THE_OWNER");
  });

  test("a second administrator cannot seize the business", async ({ page }) => {
    await signUp(page);
    const otherAdmin = `admin2_${Date.now()}`;
    const created = await apiPost(page, "/api/auth/users", {
      username: otherAdmin,
      display_name: "Second administrateur",
      password: "Test1234!",
      role: "admin",
    });
    expect(created.status).toBe(200);

    // The signup session is still open, and /login bounces an authenticated
    // visitor to the dashboard — the form would never appear.
    await logOut(page);
    await logIn(page, otherAdmin, "Test1234!");

    // Signed in as the other admin: they may manage the team, but the business
    // is not theirs to take.
    const seized = await apiPost(page, "/api/auth/owner", { user_id: created.body.id });
    expect(seized.status).toBe(403);
    expect(seized.body.code).toBe("NOT_THE_OWNER");
  });
});
