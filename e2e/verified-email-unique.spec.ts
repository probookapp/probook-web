import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { signUp, logOut } from "./helpers";
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
 */
assertTestDatabase(process.env.DATABASE_URL);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

test.afterAll(async () => {
  await pool.end();
});

/**
 * Two independent businesses, in one browser.
 *
 * `signUp` twice in a row lands on the dashboard the second time — the session
 * from the first is still open and /signup bounces an authenticated visitor —
 * so the sign-out between them is not decoration.
 */
async function twoAccounts(page: import("@playwright/test").Page) {
  const first = await signUp(page);
  await logOut(page);
  const second = await signUp(page);
  return { first: first.username, second: second.username };
}

/** The account a signup created, addressed directly. */
async function userIdOf(username: string): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE username = $1 LIMIT 1`,
    [username]
  );
  if (!r.rows[0]) throw new Error(`no user ${username}`);
  return r.rows[0].id;
}

test.describe("a verified email belongs to one account", () => {
  test("the database refuses a second account claiming it", async ({ page }) => {
    const { first, second } = await twoAccounts(page);

    const shared = `shared_${Date.now()}@example.com`;
    const firstId = await userIdOf(first);
    const secondId = await userIdOf(second);

    await pool.query(
      `UPDATE users SET email = $2, email_verified = true WHERE id = $1`,
      [firstId, shared]
    );

    // No handler, no check — just the write the race would produce.
    await expect(
      pool.query(`UPDATE users SET email = $2, email_verified = true WHERE id = $1`, [
        secondId,
        shared,
      ])
    ).rejects.toThrow(/users_verified_email_unique|duplicate key/i);
  });

  test("it refuses the same address in another case", async ({ page }) => {
    const { first, second } = await twoAccounts(page);

    const shared = `Mixed_${Date.now()}@Example.com`;
    await pool.query(`UPDATE users SET email = $2, email_verified = true WHERE id = $1`, [
      await userIdOf(first),
      shared,
    ]);

    // The application compares case-insensitively. An index on the raw column
    // would let this through and leave the database disagreeing with the code
    // about what "taken" means.
    await expect(
      pool.query(`UPDATE users SET email = $2, email_verified = true WHERE id = $1`, [
        await userIdOf(second),
        shared.toLowerCase(),
      ])
    ).rejects.toThrow(/users_verified_email_unique|duplicate key/i);
  });

  test("an unverified address reserves nothing", async ({ page }) => {
    const { first, second } = await twoAccounts(page);
    await logOut(page);
    const third = (await signUp(page)).username;

    const typo = `typo_${Date.now()}@example.com`;

    // Two people mistype the same address. Neither proved they own it, so
    // neither may block the person who actually does.
    await pool.query(`UPDATE users SET email = $2, email_verified = false WHERE id = $1`, [
      await userIdOf(first),
      typo,
    ]);
    await pool.query(`UPDATE users SET email = $2, email_verified = false WHERE id = $1`, [
      await userIdOf(second),
      typo,
    ]);

    // And the real owner can still verify it.
    const claimed = await pool.query(
      `UPDATE users SET email = $2, email_verified = true WHERE id = $1`,
      [await userIdOf(third), typo]
    );
    expect(claimed.rowCount).toBe(1);
  });

  test("giving up the address frees it for someone else", async ({ page }) => {
    const { first, second } = await twoAccounts(page);

    const address = `moved_${Date.now()}@example.com`;
    const firstId = await userIdOf(first);
    const secondId = await userIdOf(second);

    await pool.query(`UPDATE users SET email = $2, email_verified = true WHERE id = $1`, [
      firstId,
      address,
    ]);
    // Changing an email un-verifies it (see /api/auth/email), which is what
    // makes the address reusable rather than burnt.
    await pool.query(`UPDATE users SET email_verified = false WHERE id = $1`, [firstId]);

    const taken = await pool.query(
      `UPDATE users SET email = $2, email_verified = true WHERE id = $1`,
      [secondId, address]
    );
    expect(taken.rowCount).toBe(1);
  });
});
