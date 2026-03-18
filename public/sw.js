// Probook Service Worker — offline-first PWA support
const CACHE_VERSION = "v4";
const STATIC_CACHE = `probook-static-${CACHE_VERSION}`;
const API_CACHE = `probook-api-${CACHE_VERSION}`;

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
  // Don't call self.skipWaiting() here — we wait for user confirmation via the update banner
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== API_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Listen for messages from the client
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  // Clear tenant-specific API cache on logout/login
  if (event.data?.type === "CLEAR_API_CACHE") {
    caches.delete(API_CACHE);
  }
});

// Fetch handler
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-HTTP(S) requests (e.g. chrome-extension://)
  if (!url.protocol.startsWith("http")) return;

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
              caches.open(API_CACHE).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() =>
            caches.match(request).then(
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
          return caches.match(request).then(
            (cached) => cached || caches.match(`/${locale}/offline`) || caches.match("/")
          );
        })
    );
    return;
  }
});
