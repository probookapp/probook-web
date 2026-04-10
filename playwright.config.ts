import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";

// Load .env.test when running e2e tests so we hit the local test DB
dotenv.config({ path: path.resolve(__dirname, ".env.test") });

const PORT = process.env.E2E_PORT || "3001";
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
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
        timeout: 60_000,
      },
});
