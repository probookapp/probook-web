// Probook Service Worker — offline-first PWA support
const CACHE_VERSION = "v6";
// One static cache per build, named after the ?build= the app registers this
// worker with. Hashed chunks never change, but every deploy adds new ones, so a
// single cache only grew; per-build caches let the old ones be dropped.
const BUILD_ID = new URL(self.location.href).searchParams.get("build") || "unversioned";
const STATIC_CACHE_PREFIX = `probook-static-${CACHE_VERSION}-`;
const STATIC_CACHE = `${STATIC_CACHE_PREFIX}${BUILD_ID}`;
// Build ids that have activated, newest last. The previous build's cache is
// kept: a tab opened before the deploy still runs that build and may yet
// lazy-load one of its chunks, offline included.
const BUILDS_KEY = "static-builds";
const KEEP_BUILDS = 2;
// API responses are cached per user ("cache scope") so a shared device can
// never serve one tenant's cached data to another. The scope is sent by the
// app on login/logout (SET_CACHE_SCOPE) and persisted in IndexedDB so it
// survives service worker restarts.
const API_CACHE_PREFIX = `probook-api-${CACHE_VERSION}-`;

// ---- Cache scope persistence (tiny IndexedDB key-value helper) ----
const SCOPE_DB = "probook-sw";
const SCOPE_STORE = "kv";
const SCOPE_KEY = "cache-scope";

function openScopeDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SCOPE_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(SCOPE_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(key) {
  return openScopeDb()
    .then(
      (db) =>
        new Promise((resolve) => {
          const req = db
            .transaction(SCOPE_STORE, "readonly")
            .objectStore(SCOPE_STORE)
            .get(key);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(undefined);
        })
    )
    .catch(() => undefined);
}

function idbSet(key, value) {
  return openScopeDb()
    .then(
      (db) =>
        new Promise((resolve) => {
          const tx = db.transaction(SCOPE_STORE, "readwrite");
          tx.objectStore(SCOPE_STORE).put(value, key);
          tx.oncomplete = () => resolve(undefined);
          tx.onerror = () => resolve(undefined);
        })
    )
    .catch(() => undefined);
}

// Read-modify-write in one transaction, so two workers activating back to back
// cannot both read the old value and each drop the other's entry.
function idbUpdate(key, fn) {
  return openScopeDb()
    .then(
      (db) =>
        new Promise((resolve) => {
          const tx = db.transaction(SCOPE_STORE, "readwrite");
          const store = tx.objectStore(SCOPE_STORE);
          let next;
          const req = store.get(key);
          req.onsuccess = () => {
            next = fn(req.result);
            store.put(next, key);
          };
          tx.oncomplete = () => resolve(next);
          tx.onerror = () => resolve(fn(undefined));
        })
    )
    .catch(() => fn(undefined));
}

// Memoized in-memory copy; re-read from IndexedDB after a SW restart.
let cachedScope = null;

function getCacheScope() {
  if (cachedScope !== null) return Promise.resolve(cachedScope);
  return idbGet(SCOPE_KEY).then((scope) => {
    cachedScope = scope || "anon";
    return cachedScope;
  });
}

function getApiCacheName() {
  return getCacheScope().then((scope) => `${API_CACHE_PREFIX}${scope}`);
}

// App shell files to precache (Next.js serves assets from /_next/)
const SUPPORTED_LOCALES = ["en", "fr", "ar"];
const PRECACHE_URLS = ["/", ...SUPPORTED_LOCALES.map((l) => `/${l}/offline`)];

// API paths that should be cached for offline reads
const CACHEABLE_API_PATHS = [
  "/api/clients",
  "/api/products",
  "/api/invoices",
  "/api/quotes",
  "/api/delivery-notes",
  "/api/settings",
  "/api/pos/registers",
  "/api/subscription/current",
  "/api/subscription/plans",
  "/api/announcements/active",
];

// Install: precache the app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  // Take over without asking: nothing reloads the page, and the build it runs
  // keeps its cache (KEEP_BUILDS), so there is nothing for the user to confirm.
  self.skipWaiting();
});

// Activate: record this build and drop the static caches of the build that
// falls out of the last KEEP_BUILDS, plus any cache from another scheme (the
// old single static cache, pre-v6 API caches). A per-build cache missing from
// the list either belongs to a newer worker still installing — left alone — or,
// when none is, to a build superseded before it ever activated: an orphan.
self.addEventListener("activate", (event) => {
  let kept = [];
  event.waitUntil(
    idbUpdate(BUILDS_KEY, (builds) => {
      kept = [...(Array.isArray(builds) ? builds : []).filter((b) => b !== BUILD_ID), BUILD_ID].slice(
        -KEEP_BUILDS
      );
      return kept;
    })
      .then(() =>
        caches.keys().then((keys) =>
          Promise.all(
            keys
              .filter((k) => {
                if (k.startsWith(API_CACHE_PREFIX)) return false;
                if (!k.startsWith(STATIC_CACHE_PREFIX)) return true;
                if (kept.includes(k.slice(STATIC_CACHE_PREFIX.length))) return false;
                // Unlisted: an orphan unless a newer worker is on its way.
                return !self.registration.installing && !self.registration.waiting;
              })
              .map((k) => caches.delete(k))
          )
        )
      )
      .then(() => self.clients.claim())
  );
});

// Delete every API cache bucket, regardless of scope.
function deleteAllApiCaches() {
  return caches.keys().then((keys) =>
    Promise.all(
      keys.filter((k) => k.startsWith(API_CACHE_PREFIX)).map((k) => caches.delete(k))
    )
  );
}

// Listen for messages from the client
self.addEventListener("message", (event) => {
  // Clear tenant-specific API caches on logout/login
  if (event.data?.type === "CLEAR_API_CACHE") {
    event.waitUntil(deleteAllApiCaches());
  }
  // Switch the per-user cache namespace (sent on login/logout); drop buckets
  // belonging to other scopes so stale tenant data can't linger.
  if (event.data?.type === "SET_CACHE_SCOPE") {
    const scope = event.data.scope || "anon";
    cachedScope = scope;
    event.waitUntil(
      Promise.all([
        idbSet(SCOPE_KEY, scope),
        caches.keys().then((keys) =>
          Promise.all(
            keys
              .filter((k) => k.startsWith(API_CACHE_PREFIX) && k !== `${API_CACHE_PREFIX}${scope}`)
              .map((k) => caches.delete(k))
          )
        ),
      ])
    );
  }
});

// Fetch handler
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-HTTP(S) requests (e.g. chrome-extension://)
  if (!url.protocol.startsWith("http")) return;

  // Only handle same-origin requests. Cross-origin requests (Meta Pixel,
  // analytics, third-party CDNs) must go straight to the network — intercepting
  // them here breaks their loading, since a SW-initiated fetch runs under the
  // CSP captured when the worker was installed, not the current page's.
  if (url.origin !== self.location.origin) return;

  // Skip non-GET requests (mutations are handled by the offline queue)
  if (request.method !== "GET") return;

  // API requests: network-first with cache fallback (only cache data APIs)
  if (url.pathname.startsWith("/api/")) {
    const shouldCache = CACHEABLE_API_PATHS.some((p) =>
      url.pathname.startsWith(p)
    );
    if (shouldCache) {
      event.respondWith(
        fetch(request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone();
              getApiCacheName()
                .then((name) => caches.open(name))
                .then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() =>
            // Only match the current scope's bucket — never another user's.
            getApiCacheName()
              .then((name) => caches.open(name))
              .then((cache) => cache.match(request))
              .then(
                (cached) =>
                  cached ||
                  new Response(JSON.stringify({ error: "Offline" }), {
                    status: 503,
                    headers: { "Content-Type": "application/json" },
                  })
              )
          )
      );
    } else {
      // Non-cacheable API (auth, admin): network only, graceful offline error
      event.respondWith(
        fetch(request).catch(
          () =>
            new Response(JSON.stringify({ error: "Offline" }), {
              status: 503,
              headers: { "Content-Type": "application/json" },
            })
        )
      );
    }
    return;
  }

  // Static assets (JS, CSS, images, fonts)
  if (
    url.pathname.startsWith("/_next/") ||
    url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|gif|webp|ico|woff|woff2|ttf)$/)
  ) {
    // /_next/static/ files are content-hashed — cache-first is safe and faster
    if (url.pathname.startsWith("/_next/static/")) {
      event.respondWith(
        caches.match(request).then(
          (cached) =>
            cached ||
            fetch(request).then((response) => {
              if (response.ok) {
                const clone = response.clone();
                caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
              }
              return response;
            })
        )
      );
    } else {
      // Other static files: network-first with cache fallback
      event.respondWith(
        fetch(request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => caches.match(request))
      );
    }
    return;
  }

  // Navigation requests: network-first, fallback to cached page or offline page
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          // Extract locale from URL path (e.g. /fr/dashboard → "fr")
          const pathLocale = new URL(request.url).pathname.split("/")[1];
          const locale = SUPPORTED_LOCALES.includes(pathLocale) ? pathLocale : "en";
          // Each match resolves to undefined on a miss, so they are chained —
          // `a || caches.match(b)` stopped at the first promise, truthy even
          // when empty, and respondWith(undefined) is a network error.
          return caches
            .match(request)
            .then((cached) => cached || caches.match(`/${locale}/offline`))
            .then((cached) => cached || caches.match("/"))
            .then((cached) => cached || Response.error());
        })
    );
    return;
  }
});
