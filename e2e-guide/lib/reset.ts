import { Client } from "pg";
import { assertTestDatabase } from "../../e2e/assert-test-db";

/**
 * Frees the demo account so chapter 1 can sign up with a clean address.
 *
 * Signing up needs an email, a login and a company slug nobody has taken.
 * Earlier takes left all three behind, so the chapter used to add a per-run
 * stamp:
 * `contact+gekpa@electro-souk.dz`, `karim-gekpa`. That works, but it is typed
 * on camera — a viewer reads it as a throwaway test account and trusts the rest
 * of the film a little less.
 *
 * Only the identifiers are taken back; the old tenant's data stays where it
 * is. Deleting it outright looked tidier and does not work: the tenant cascade
 * reaches the products, but a purchase order line references a product under
 * RESTRICT, so the delete is refused halfway through. Renaming is enough for
 * what this needs, and it cannot half-succeed.
 *
 * Plain `pg` rather than Prisma: the generated client is TypeScript compiled by
 * the application's bundler, and Playwright's own transform cannot load it.
 *
 * Only ever against the local test database: the guard throws before the first
 * connection if DATABASE_URL points anywhere else.
 */
export async function releaseDemoAccount(
  account: { email: string; username: string; staffUsernames?: string[] }
): Promise<void> {
  assertTestDatabase(process.env.DATABASE_URL);

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE tenants SET slug = slug || '-take-' || left(id, 8)
        WHERE id IN (SELECT tenant_id FROM users WHERE email = $1)`,
      [account.email]
    );
    await client.query(
      `UPDATE users SET email = 'retired-' || left(id, 8) || '-' || email
        WHERE email = $1`,
      [account.email]
    );
    // A login names one person across every business: signup and the user
    // settings both refuse a name taken elsewhere, whatever its case, even
    // though the column is only unique per tenant. Releasing the address
    // without the logins left the forms refusing the name.
    await client.query(
      `UPDATE users SET username = 'retired-' || left(id, 8) || '-' || username
        WHERE lower(username) = ANY($1)`,
      [[account.username, ...(account.staffUsernames ?? [])].map((u) => u.toLowerCase())]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}
