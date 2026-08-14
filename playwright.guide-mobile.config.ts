import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";
import { assertTestDatabase } from "./e2e/assert-test-db";

/**
 * The phone guide.
 *
 * Same idea as playwright.guide.config.ts, filmed portrait at 390x844 — the
 * shape a prospect actually watches on WhatsApp or Instagram, and the width the
 * responsive audit already holds the application to. The chapters are their own
 * (./e2e-guide-mobile): the desktop ones drive tables and hover affordances that
 * do not exist at this width, so reusing them would film a fiction.
 *
 * Run:  npx playwright test --config=playwright.guide-mobile.config.ts
 * Then: node scripts/build-guide-videos.mjs --mobile
 */
// override:true is not optional — see the note in playwright.guide.config.ts.
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

// Portrait, at the phone width the responsive barrier tests. Doubling the pixel
// ratio gives a 780x1688 recording: sharp on a phone screen, still 9:19.5.
const WIDTH = Number(process.env.GUIDE_MOBILE_WIDTH || 390);
const HEIGHT = Number(process.env.GUIDE_MOBILE_HEIGHT || 844);
const SCALE = Number(process.env.GUIDE_MOBILE_SCALE || 2);

const HEADED = process.env.GUIDE_HEADED === "1";
const FAST = process.env.GUIDE_FAST === "1";

export default defineConfig({
  testDir: "./e2e-guide-mobile",
  // Compile every route before the first chapter. Without it the first run
  // after a cold build pays Next's on-demand compilation inside a chapter —
  // which fails a take, and during filming wastes the whole recording.
  globalSetup: require.resolve("./e2e/global-setup"),
  outputDir: `./guide-output/${GUIDE_LOCALE}/mobile-raw`,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  maxFailures: FAST ? 0 : 1,
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
    video: FAST ? "off" : { mode: "on", size: { width: WIDTH * SCALE, height: HEIGHT * SCALE } },
    trace: FAST ? "retain-on-failure" : "off",
    screenshot: FAST ? "only-on-failure" : "off",
    actionTimeout: 30_000,
    launchOptions: {
      slowMo: FAST ? 0 : Number(process.env.GUIDE_SLOWMO || 220),
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
