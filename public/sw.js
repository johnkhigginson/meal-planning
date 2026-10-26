// Bump VERSION whenever this file or offline.html changes. Activation deletes
// every cache that is not in CURRENT_CACHES, including the v1 cache from the
// old worker, which held full HTML pages.
const VERSION = "v2";
const STATIC_CACHE = `lemon-kitchen-static-${VERSION}`;
const OFFLINE_CACHE = `lemon-kitchen-offline-${VERSION}`;
const CURRENT_CACHES = [STATIC_CACHE, OFFLINE_CACHE];
const OFFLINE_URL = "/offline.html";

// Files from public/ that are safe to cache: icons, images and fonts. Pages,
// /api/* and /_next/image (which proxies uploads) are never cached, so a
// signed-in page can't be served from cache after sign-out.
const STATIC_FILE = /\.(?:png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf)$/i;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icon.svg"].map((url) => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !CURRENT_CACHES.includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isStaticAsset(url) {
  if (url.pathname.startsWith("/_next/static/")) return true;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/")) return false;
  return STATIC_FILE.test(url.pathname);
}

// Only plain, public, same-origin responses go in the cache. A redirect (for
// example to /login) or a response marked private or no-store is skipped.
function isCacheable(response) {
  if (!response.ok || response.type !== "basic" || response.redirected) return false;
  const cacheControl = response.headers.get("Cache-Control") || "";
  return !/no-store|private/i.test(cacheControl);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Pages always come from the network. The offline page is only shown when
  // the network fails.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL, { cacheName: OFFLINE_CACHE })));
    return;
  }

  if (!isStaticAsset(url) || request.headers.has("Authorization")) return;

  // Cache first: /_next/static files are content-hashed, and icons rarely
  // change. A new VERSION clears them.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (isCacheable(response)) {
            const copy = response.clone();
            event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy)));
          }
          return response;
        })
    )
  );
});
