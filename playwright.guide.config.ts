import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";
import { assertTestDatabase } from "./e2e/assert-test-db";

/**
 * Screen-recording config for the customer-facing "guide d'utilisation" videos.
 *
 * This is NOT the test config (see playwright.config.ts). It drives the real app
 * slowly, with an on-screen caption bar and a visible cursor, and records one
 * video per chapter. Chapters live in ./e2e-guide and share one tenant via
 * e2e-guide/.session.json (written by chapter 01).
 *
 * Run:  npx playwright test --config=playwright.guide.config.ts
 * Then: node scripts/build-guide-videos.mjs   (webm -> mp4, named per chapter)
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
/**
 * One tree per language. Recording English into the same folder as French
 * would overwrite it silently, and the only sign would be a French chapter
 * playing under an English name.
 */
const GUIDE_LOCALE = (process.env.GUIDE_LOCALE || "fr").toLowerCase();

const PORT = process.env.E2E_PORT || "3021";
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;

// Published so globalSetup cannot compute a different one. It used to fall
// back to port 3001 — a port another project on this machine listens on — so
// the warm-up spent every run politely fetching a stranger's application
// while this one stayed cold. Its errors were swallowed, so it reported
// success in four seconds and nobody looked again.
process.env.E2E_BASE_URL = BASE_URL;

// Recording resolution. 1080p by default so the exported MP4 is upload-ready.
const WIDTH = Number(process.env.GUIDE_WIDTH || 1920);
const HEIGHT = Number(process.env.GUIDE_HEIGHT || 1080);

// Headless records the same video and does not depend on the host screen size.
// GUIDE_HEADED=1 to watch the run live (window may exceed a 1080p screen).
const HEADED = process.env.GUIDE_HEADED === "1";

// GUIDE_FAST=1 turns the same chapters into a plain UI regression run: no
// narration dwell, no slow motion, no video. Run this green before filming.
const FAST = process.env.GUIDE_FAST === "1";

export default defineConfig({
  testDir: "./e2e-guide",
  // Chapters only. Playwright's default also matches `*.test.ts`, which would
  // sweep up e2e-guide/__tests__/guide-captions.test.ts — a vitest file, and
  // importing vitest under Playwright throws before a single chapter opens.
  testMatch: "**/*.spec.ts",
  // Compile every route before the first chapter. Without it the first run
  // after a cold build pays Next's on-demand compilation inside a chapter —
  // which fails a take, and during filming wastes the whole recording.
  globalSetup: require.resolve("./e2e/global-setup"),
  outputDir: `./guide-output/${GUIDE_LOCALE}/raw`,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // While filming, a failure mid-run makes every later chapter meaningless, so
  // stop. In FAST (verification) mode, surface every broken flow in one pass.
  maxFailures: FAST ? 0 : 1,
  timeout: 15 * 60_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    locale: "fr-FR",
    timezoneId: "Africa/Algiers",
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
    video: FAST ? "off" : { mode: "on", size: { width: WIDTH, height: HEIGHT } },
    trace: FAST ? "retain-on-failure" : "off",
    screenshot: FAST ? "only-on-failure" : "off",
    actionTimeout: 30_000,
    launchOptions: {
      // Every Playwright action pauses this long — the single biggest lever on
      // how "followable" the footage is. Keep in sync with GUIDE_SLOWMO.
      slowMo: FAST ? 0 : Number(process.env.GUIDE_SLOWMO || 220),
      args: [`--window-size=${WIDTH},${HEIGHT}`, "--hide-scrollbars"],
    },
  },
  projects: [
    {
      name: "guide",
      use: {
        ...devices["Desktop Chrome"],
        // AFTER the device spread, never before: Desktop Chrome pins a
        // 1280x720 viewport, and a project-level `use` beats the top-level one.
        // Left unset, the page renders at 720p inside a 1080p frame and the
        // recording comes out letterboxed into the top-left corner.
        viewport: { width: WIDTH, height: HEIGHT },
        headless: !HEADED,
      },
    },
  ],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    env: {
      // Hides the Next dev badge for the take. Only when actually recording:
      // GUIDE_FAST runs the same chapters as tests, where the badge — and the
      // "Compiling…" pill in particular — is a diagnostic worth keeping.
      GUIDE_RECORDING: process.env.GUIDE_FAST === "1" ? "0" : "1",
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
