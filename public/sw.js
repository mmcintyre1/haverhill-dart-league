const CACHE = "hdl-v1";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (e) => {
  // Pre-cache the offline fallback page
  e.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  // Delete old caches from previous versions
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Cache-first: Next.js static chunks are content-hashed and immutable
  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            if (res.ok) {
              caches.open(CACHE).then((c) => c.put(request, res.clone()));
            }
            return res;
          })
      )
    );
    return;
  }

  // Network-first for page navigations — show offline fallback on failure
  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // Default: network only (API routes, dynamic data)
});
