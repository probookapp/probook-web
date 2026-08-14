/**
 * Last line of defence before anything writes to a database.
 *
 * The e2e and guide suites sign up tenants, issue invoices and adjust stock.
 * Pointed at production that is destructive, and the ways it can happen are
 * quiet: a wrapper that loads the production `.env` first, a shell that already
 * exports DATABASE_URL, a config that forgets `override: true`. Fail loudly and
 * before the first connection instead.
 */
export function assertTestDatabase(url: string | undefined): void {
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. The e2e suites must run against the local " +
        "probook_test database (see .env.test)."
    );
  }

  const isLocalHost = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const isTestDatabase = /\/probook_test(\?|$)/.test(url);

  if (!isLocalHost || !isTestDatabase) {
    throw new Error(
      "Refusing to run: DATABASE_URL does not point at the local probook_test " +
        `database.\n  got: ${url.replace(/:[^:@/]*@/, ":***@")}\n` +
        "These suites create and delete tenant data — they must never touch production."
    );
  }
}
