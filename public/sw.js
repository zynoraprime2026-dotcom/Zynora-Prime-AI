// ============================================================
// Service worker — app-shell caching for offline/installed use.
//
// Deliberately conservative:
//  - Only handles GET requests to our own origin. Everything else
//    (POST requests, /api/chat, and cross-origin calls like Supabase)
//    passes straight through untouched — auth and chat data must
//    never be served from a stale cache.
//  - Network-first, not cache-first: always tries the real network
//    first and only falls back to the cache when offline. This means
//    a new deployment is never blocked by an old cached version —
//    the classic PWA bug where users get stuck on stale code.
// ============================================================

const CACHE_NAME = "zynora-prime-v1";
const PRECACHE_URLS = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/")))
  );
});
