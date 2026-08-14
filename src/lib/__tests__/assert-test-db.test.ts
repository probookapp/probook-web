import { describe, it, expect } from "vitest";
import { assertTestDatabase } from "../../../e2e/assert-test-db";

/**
 * The e2e and guide suites create tenants, issue invoices and adjust stock.
 * This guard is what stands between that and a production database.
 */
describe("assertTestDatabase", () => {
  it("accepts the local test database", () => {
    expect(() =>
      assertTestDatabase("postgresql://postgres:pw@localhost:5432/probook_test")
    ).not.toThrow();
    expect(() =>
      assertTestDatabase("postgresql://postgres:pw@127.0.0.1:5432/probook_test?schema=public")
    ).not.toThrow();
  });

  it("refuses a managed/remote host", () => {
    // The exact shape that leaked through once: `npx dotenv` loaded the
    // production .env before Playwright, and dotenv did not override it.
    expect(() =>
      assertTestDatabase(
        "postgresql://postgres.abc:pw@aws-1-eu-west-1.pooler.supabase.com:6543/postgres"
      )
    ).toThrow(/probook_test/);
  });

  it("refuses another database on localhost", () => {
    expect(() =>
      assertTestDatabase("postgresql://postgres:pw@localhost:5432/probook")
    ).toThrow(/probook_test/);
  });

  it("refuses a missing URL rather than defaulting to something", () => {
    expect(() => assertTestDatabase(undefined)).toThrow(/DATABASE_URL/);
    expect(() => assertTestDatabase("")).toThrow(/DATABASE_URL/);
  });

  it("never echoes the password back", () => {
    try {
      assertTestDatabase("postgresql://postgres:sup3rs3cret@db.example.com:5432/postgres");
      throw new Error("expected assertTestDatabase to throw");
    } catch (e) {
      expect((e as Error).message).not.toContain("sup3rs3cret");
      expect((e as Error).message).toContain(":***@");
    }
  });
});
