import { z } from "zod";

/**
 * The guided tours each person has finished or dismissed for good.
 *
 * - `office`: the first-login tour of the back office (sidebar, documents,
 *   till, reports, settings).
 * - `pos`: the till's own short tour, shown the first time a session is open.
 * - `checklist`: the "getting started" card on the dashboard, once hidden.
 *
 * Kept per person (User.toursCompleted) rather than per browser, so a tour
 * seen at the office does not come back on the phone. Unknown keys are dropped
 * on read, so a key retired later cannot make a tour reappear.
 */
export const TOUR_KEYS = ["office", "pos", "checklist"] as const;
export type TourKey = (typeof TOUR_KEYS)[number];

export const tourCompleteSchema = z.object({
  tour: z.enum(TOUR_KEYS),
});

export function parseToursCompleted(raw: unknown): TourKey[] {
  if (!Array.isArray(raw)) return [];
  return TOUR_KEYS.filter((key) => raw.includes(key));
}

/**
 * Automated browsers (Playwright, the guide recorder) never get a tour on
 * their own: it would sit over the first click of every test. A test that
 * wants one opens it by hand, the way a person replays it.
 */
export function isAutomatedBrowser(): boolean {
  return typeof navigator !== "undefined" && navigator.webdriver === true;
}
