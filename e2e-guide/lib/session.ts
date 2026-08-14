import fs from "fs";
import path from "path";
import type { BrowserContext, Page } from "@playwright/test";
import { installTourRuntime, LOCALE } from "./tour";

const FILE = path.resolve(__dirname, "..", ".session.json");

type StoredCookies = Parameters<BrowserContext["addCookies"]>[0];

export interface GuideSession {
  company: string;
  username: string;
  password: string;
  email: string;
  cookies: StoredCookies;
}

/**
 * Chapter 01 signs up for real (that's the footage); later chapters reuse the
 * same tenant so the account looks progressively lived-in instead of resetting
 * to an empty database on every video.
 */
export async function saveSession(
  page: Page,
  creds: { company: string; username: string; password: string; email: string }
) {
  const cookies = await page.context().cookies();
  fs.writeFileSync(FILE, JSON.stringify({ ...creds, cookies }, null, 2), "utf8");
}

export function readSession(): GuideSession {
  if (!fs.existsSync(FILE)) {
    throw new Error(
      "e2e-guide/.session.json is missing — run chapter 01 first " +
        "(npx playwright test --config=playwright.guide.config.ts)"
    );
  }
  return JSON.parse(fs.readFileSync(FILE, "utf8")) as GuideSession;
}

/** Restore the tenant session into a fresh browser context and land on a page. */
export async function resume(page: Page, route = "dashboard"): Promise<GuideSession> {
  const session = readSession();
  await page.context().addCookies(session.cookies);
  await installTourRuntime(page);
  await page.goto(`/${LOCALE}/${route}`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  return session;
}
