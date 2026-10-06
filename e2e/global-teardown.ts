import { tidyGlobalRows } from "./tidy-global-rows";

/**
 * Tidy after the run as well as before it.
 *
 * globalSetup already retires the plans earlier runs left behind, but only when
 * the next run starts. Until then they are live: the local landing page and
 * pricing page list a dozen "Billing Test Plan" cards, and so does the
 * subscription screen of every tenant — which is what anyone opening the app
 * after a run, or the guide filming it, sees first. Setup keeps its own pass for
 * runs that crash before reaching this one.
 */
export default async function globalTeardown() {
  if (process.env.CI) return;
  await tidyGlobalRows();
}
