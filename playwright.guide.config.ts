import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";
import { assertTestDatabase } from "./e2e/assert-test-db";

/**
 * The user guide's chapters (./e2e-guide): UI tests that are also the source
 * of the written guide on /guide.
 *
 * This is NOT the test config (see playwright.config.ts). The chapters share one
 * tenant via e2e-guide/.session.json (written by chapter 01). With
 * GUIDE_SHOTS=1 each step's screen is captured for the guide — see
 * e2e-guide/README.md.
 *
 * Run:  npm run guide:check      (verify)
 *       npm run guide:shots      (verify and capture the screenshots)
 */
// override:true is not optional. Without it, a DATABASE_URL already present in
// the environment wins — and a wrapper like `npx dotenv` loads the PRODUCTION
// .env before Playwright ever starts, which would silently point the dev server
// at production.
dotenv.config({ path: path.resolve(__dirname, ".env.test"), override: true });
assertTestDatabase(process.env.DATABASE_URL);

// 3021, not 3001: reuseExistingServer means Playwright adopts whatever is
// already listening, and 3001 is a common default that another project can
// be holding. The suite then runs green or red against a stranger's app —
// which is exactly what happened once. A dedicated port keeps that honest.
/** One output tree per language. */
const GUIDE_LOCALE = (process.env.GUIDE_LOCALE || "fr").toLowerCase();

const PORT = process.env.E2E_PORT || "3021";
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;

// Published so globalSetup cannot compute a different one. It used to fall
// back to port 3001 — a port another project on this machine listens on — so
// the warm-up spent every run politely fetching a stranger's application
// while this one stayed cold. Its errors were swallowed, so it reported
// success in four seconds and nobody looked again.
process.env.E2E_BASE_URL = BASE_URL;

// A common laptop screen. The screenshots are taken at twice its pixel density,
// so they stay sharp when the guide shows them at the width of its column.
const WIDTH = Number(process.env.GUIDE_WIDTH || 1440);
const HEIGHT = Number(process.env.GUIDE_HEIGHT || 900);

// GUIDE_HEADED=1 to watch the chapters run.
const HEADED = process.env.GUIDE_HEADED === "1";

const SHOTS = process.env.GUIDE_SHOTS === "1";

export default defineConfig({
  testDir: "./e2e-guide",
  // Chapters only. Playwright's default also matches `*.test.ts`, which would
  // sweep up e2e-guide/__tests__/guide-captions.test.ts — a vitest file, and
  // importing vitest under Playwright throws before a single chapter opens.
  testMatch: "**/*.spec.ts",
  // Compile every route before the first chapter. Without it the first run
  // after a cold build pays Next's on-demand compilation inside a chapter.
  globalSetup: require.resolve("./e2e/global-setup"),
  // And after: see e2e/global-teardown.ts.
  globalTeardown: require.resolve("./e2e/global-teardown"),
  outputDir: `./guide-output/test-results/${GUIDE_LOCALE}`,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Surface every broken flow in one pass.
  maxFailures: 0,
  timeout: 15 * 60_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    locale: "fr-FR",
    timezoneId: "Africa/Algiers",
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 2,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 30_000,
    launchOptions: {
      args: [`--window-size=${WIDTH},${HEIGHT}`, "--hide-scrollbars"],
    },
  },
  projects: [
    {
      name: "guide",
      use: {
        ...devices["Desktop Chrome"],
        // AFTER the device spread, never before: Desktop Chrome pins a
        // 1280x720 viewport and a scale of 1, and a project-level `use` beats
        // the top-level one.
        viewport: { width: WIDTH, height: HEIGHT },
        deviceScaleFactor: 2,
        headless: !HEADED,
      },
    },
  ],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    env: {
      // Hides the Next dev badge from the screenshots. Only when taking them:
      // in a plain check the badge — and the "Compiling…" pill in particular —
      // is a diagnostic worth keeping.
      GUIDE_RECORDING: SHOTS ? "1" : "0",
      DATABASE_URL: process.env.DATABASE_URL!,
      JWT_SECRET: process.env.JWT_SECRET!,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || BASE_URL,
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || BASE_URL,
      NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || "Probook",
    },
    url: BASE_URL,
    reuseExistingServer: true,
    // 180 s, matching playwright.config.ts: a cold `next dev` on this
    // project regularly takes past two minutes to answer its first request,
    // and the run then dies before a single chapter opens — which reads as a
    // broken application rather than a slow start.
    timeout: 180_000,
  },
});
