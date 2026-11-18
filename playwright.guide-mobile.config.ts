import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";
import { assertTestDatabase } from "./e2e/assert-test-db";

/**
 * The phone guide.
 *
 * Same idea as playwright.guide.config.ts, at 390x844 — the width the
 * responsive audit already holds the application to. The chapters are their own
 * (./e2e-guide-mobile): the desktop ones drive tables and hover affordances that
 * do not exist at this width, so reusing them would show a fiction.
 *
 * Run:  npm run guide:mobile:check      (verify)
 *       npm run guide:mobile:shots      (verify and capture the screenshots)
 */
// override:true is not optional — see the note in playwright.guide.config.ts.
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

// Portrait, at the phone width the responsive barrier tests, at twice the pixel
// density so the screenshots stay sharp.
const WIDTH = Number(process.env.GUIDE_MOBILE_WIDTH || 390);
const HEIGHT = Number(process.env.GUIDE_MOBILE_HEIGHT || 844);
const SCALE = Number(process.env.GUIDE_MOBILE_SCALE || 2);

const HEADED = process.env.GUIDE_HEADED === "1";
const SHOTS = process.env.GUIDE_SHOTS === "1";

export default defineConfig({
  testDir: "./e2e-guide-mobile",
  // Compile every route before the first chapter. Without it the first run
  // after a cold build pays Next's on-demand compilation inside a chapter.
  globalSetup: require.resolve("./e2e/global-setup"),
  // And after: see e2e/global-teardown.ts.
  globalTeardown: require.resolve("./e2e/global-teardown"),
  outputDir: `./guide-output/test-results/${GUIDE_LOCALE}-mobile`,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  maxFailures: 0,
  timeout: 15 * 60_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    locale: "fr-FR",
    timezoneId: "Africa/Algiers",
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: SCALE,
    isMobile: true,
    hasTouch: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 30_000,
    launchOptions: {
      args: [`--window-size=${WIDTH},${HEIGHT}`, "--hide-scrollbars"],
    },
  },
  projects: [
    {
      name: "guide-mobile",
      use: {
        ...devices["Pixel 7"],
        // After the device spread, never before — see the desktop config.
        viewport: { width: WIDTH, height: HEIGHT },
        deviceScaleFactor: SCALE,
        headless: !HEADED,
      },
    },
  ],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    env: {
      // Hides the Next dev badge from the screenshots — see the desktop config.
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
