import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { signUp } from "./helpers";
import { apiPost } from "./api-helpers";
import { assertTestDatabase } from "./assert-test-db";

/**
 * One account may hold a given verified email, and the database says so.
 *
 * The application checked first and wrote second, which leaves a window: two
 * verifications landing together both read "free" and both write. The email is
 * the identity behind the subscribe gate and password reset, so two accounts
 * claiming it is not cosmetic.
 *
 * These tests go straight to SQL on purpose. The point is not that the handler
 * refuses — it already did — but that the *constraint* exists and holds even
 * when no handler is involved: a background job, a future endpoint, a console
 * session. A guarantee that only one code path honours is not a guarantee.
 *
 * One tenant, three accounts. Signing up three times would send three
 * verification emails and mint three tenants for a rule that is global to the
 * table anyway — and a suite that signs up more than it needs makes every other
 * suite slower and its own failures harder to read.
 */
assertTestDatabase(process.env.DATABASE_URL);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

test.afterAll(async () => {
  await pool.end();
});

/** Three user rows in one business, addressed by id. */
async function threeAccounts(page: import("@playwright/test").Page) {
  const owner = await signUp(page);
  const stamp = Date.now();
  const ids: string[] = [];

  for (const n of [1, 2]) {
    const created = await apiPost(page, "/api/auth/users", {
      username: `email_probe_${n}_${stamp}`,
      display_name: `Email probe ${n}`,
      password: "Employee123!",
      role: "employee",
    });
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    ids.push(created.body.id as string);
  }

  const r = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE username = $1 LIMIT 1`,
    [owner.username]
  );
  return { first: r.rows[0].id, second: ids[0], third: ids[1] };
}

/** Claim an address as verified, straight at the table. */
const verify = (id: string, email: string) =>
  pool.query(`UPDATE users SET email = $2, email_verified = true WHERE id = $1`, [id, email]);

test.describe("a verified email belongs to one account", () => {
  test("the database refuses a second account claiming it", async ({ page }) => {
    const { first, second } = await threeAccounts(page);
    const shared = `shared_${Date.now()}@example.com`;

    await verify(first, shared);

    // No handler, no check — just the write the race would produce.
    await expect(verify(second, shared)).rejects.toThrow(
      /users_verified_email_unique|duplicate key/i
    );
  });

  test("it refuses the same address in another case", async ({ page }) => {
    const { first, second } = await threeAccounts(page);
    const shared = `Mixed_${Date.now()}@Example.com`;

    await verify(first, shared);

    // The application compares case-insensitively. An index on the raw column
    // would let this through and leave the database disagreeing with the code
    // about what "taken" means.
    await expect(verify(second, shared.toLowerCase())).rejects.toThrow(
      /users_verified_email_unique|duplicate key/i
    );
  });

  test("an unverified address reserves nothing", async ({ page }) => {
    const { first, second, third } = await threeAccounts(page);
    const typo = `typo_${Date.now()}@example.com`;

    // Two people mistype the same address. Neither proved they own it, so
    // neither may block the person who actually does.
    for (const id of [first, second]) {
      await pool.query(
        `UPDATE users SET email = $2, email_verified = false WHERE id = $1`,
        [id, typo]
      );
    }

    const claimed = await verify(third, typo);
    expect(claimed.rowCount).toBe(1);
  });

  test("giving up the address frees it for someone else", async ({ page }) => {
    const { first, second } = await threeAccounts(page);
    const address = `moved_${Date.now()}@example.com`;

    await verify(first, address);
    // Changing an email un-verifies it (see /api/auth/email), which is what
    // makes the address reusable rather than burnt.
    await pool.query(`UPDATE users SET email_verified = false WHERE id = $1`, [first]);

    const taken = await verify(second, address);
    expect(taken.rowCount).toBe(1);
  });
});
