import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";
import { assertTestDatabase } from "./e2e/assert-test-db";

// Load .env.test when running e2e tests so we hit the local test DB.
// override:true is not optional: a DATABASE_URL already exported by the shell —
// or loaded from the production .env by a wrapper such as `npx dotenv` — would
// otherwise win and point the dev server at production.
dotenv.config({ path: path.resolve(__dirname, ".env.test"), override: true });
assertTestDatabase(process.env.DATABASE_URL);

// 3021, not 3001: reuseExistingServer means Playwright adopts whatever is
// already listening, and 3001 is a common default that another project can
// be holding. The suite then runs green or red against a stranger's app —
// which is exactly what happened once. A dedicated port keeps that honest.
const PORT = process.env.E2E_PORT || "3021";
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;

// Published so globalSetup cannot compute a different one. It used to fall
// back to port 3001 — a port another project on this machine listens on — so
// the warm-up spent every run politely fetching a stranger's application
// while this one stayed cold. Its errors were swallowed, so it reported
// success in four seconds and nobody looked again.
process.env.E2E_BASE_URL = BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  // Compile every route once before the first test, so a cold Next.js dev
  // server does not charge its compile time to whichever test arrives first.
  globalSetup: require.resolve("./e2e/global-setup"),
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  // Nearly every spec signs up in beforeEach, which creates a tenant, its
  // settings, its default stock location and a trial before landing on the
  // dashboard. Playwright's 30 s default cut that short often enough to look
  // like a product failure — and it capped the 45 s the helper itself waits.
  timeout: 90_000,
  reporter: "html",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.CI
    ? undefined
    : {
        command: `npx next dev -p ${PORT}`,
        env: {
          DATABASE_URL: process.env.DATABASE_URL!,
          JWT_SECRET: process.env.JWT_SECRET!,
          NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || BASE_URL,
          NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || BASE_URL,
          NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || "Probook Test",
        },
        url: BASE_URL,
        reuseExistingServer: true,
        // A cold `next dev` on this project takes well over a minute to answer
        // its first request; 60 s made the whole suite fail before a single
        // test ran, which reads like a broken application rather than a slow
        // start.
        timeout: 180_000,
      },
});
