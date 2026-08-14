import { request } from "@playwright/test";

/**
 * Warm the dev server before the suite starts.
 *
 * Next.js in development compiles a route the first time it is requested. A
 * 296-test run hits dozens of cold routes in its opening minutes, and the wait
 * lands inside whichever test happened to get there first — which is why the
 * failures moved around from run to run: a signup form that had not rendered
 * within the test timeout, an admin bootstrap that answered with a compiling
 * page instead of JSON. None of it was the application.
 *
 * Paying that cost once, here, is the whole fix. It is skipped in CI, which
 * runs against a production build where nothing compiles on demand.
 */
const ROUTES = [
  "/fr/signup",
  "/fr/login",
  "/fr/dashboard",
  "/fr/invoices",
  "/fr/quotes",
  "/fr/products",
  "/fr/clients",
  "/fr/expenses",
  "/fr/reports",
  "/fr/settings",
  "/fr/pos",
  "/en/admin",
  "/en/admin/login",
];

export default async function globalSetup() {
  if (process.env.CI) return;

  // Set by every Playwright config, so this cannot drift onto another port.
  const baseURL = process.env.E2E_BASE_URL;
  if (!baseURL) {
    throw new Error(
      "E2E_BASE_URL is not set. The Playwright config publishes it; running " +
        "globalSetup without one used to silently warm http://localhost:3001, " +
        "which belongs to a different project on this machine."
    );
  }

  const context = await request.newContext({ baseURL });

  const started = Date.now();
  const cold: string[] = [];
  // Sequential on purpose: the dev server compiles one route at a time anyway,
  // and firing them together only makes the slowest one slower.
  for (const route of ROUTES) {
    // A redirect to /login for a signed-out visitor is a warm route too — only
    // a failure to answer at all means the route never compiled.
    try {
      await context.get(route, { timeout: 120_000 });
    } catch (err) {
      const why = err instanceof Error ? err.message.split("\n")[0] : String(err);
      cold.push(`${route}: ${why}`);
    }
  }
  await context.dispose();

  const seconds = Math.round((Date.now() - started) / 1000);
  if (cold.length) {
    // Loudly: a warm-up that quietly warms nothing hands its cost to whichever
    // test arrives first, and the failure surfaces somewhere unrelated.
    throw new Error(
      `[warmup] ${cold.length} route(s) never answered:` + "\n" + cold.join("\n")
    );
  }
  console.log(`[warmup] ${ROUTES.length} routes compiled in ${seconds}s (${baseURL})`);
}
