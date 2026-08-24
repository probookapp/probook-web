import type { Page } from "@playwright/test";

/**
 * Drop the app's persisted React-Query cache.
 *
 * The app writes its query cache to IndexedDB (idb-keyval: db "keyval-store",
 * store "keyval", keys "probook-query-cache:<scope>", one bucket per user) with
 * a 60 s staleTime. A test that changes server state and then navigates is
 * therefore read by a page still holding what was cached at sign-up — a null
 * subscription, the old company settings — and asserts against the previous
 * world. Clearing the keys makes the next load refetch.
 *
 * Every failure mode resolves rather than throws: a browser context that never
 * opened the database has nothing to clear, and that is not a test failure.
 */
export async function clearPersistedQueryCache(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const open = indexedDB.open("keyval-store");
        open.onsuccess = () => {
          const db = open.result;
          try {
            const tx = db.transaction("keyval", "readwrite");
            const store = tx.objectStore("keyval");
            const req = store.getAllKeys();
            req.onsuccess = () => {
              for (const key of req.result) {
                if (String(key).startsWith("probook-query-cache")) store.delete(key);
              }
            };
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => {
              db.close();
              resolve();
            };
          } catch {
            resolve();
          }
        };
        open.onerror = () => resolve();
      })
  );
}

/**
 * Reload the current page with nothing cached.
 *
 * Clearing alone is not enough right after a navigation: the persister writes on
 * a throttle, so a clear that lands before its write is undone by that write,
 * and the reload rehydrates the very state the test was trying to drop. Letting
 * the page settle first, then clearing, then reloading, removes the race — the
 * page being torn down cannot write again.
 */
export async function reloadWithFreshCache(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  await clearPersistedQueryCache(page);
  await page.reload();
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
}
