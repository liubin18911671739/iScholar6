const CACHE_VERSION = "ischolar-v6.0-1";
const STATIC_CACHE = `ischolar-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `ischolar-dynamic-${CACHE_VERSION}`;

const APP_SHELL = ["/", "/login", "/dashboard", "/offline.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== DYNAMIC_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (!url.protocol.startsWith("http")) return;

  // Next.js HMR / dev
  if (url.pathname.startsWith("/_next/webpack")) return;

  // API GET: network-first with cache fallback
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/data/")) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Static assets: cache-first
  if (
    url.pathname.startsWith("/_next/static") ||
    /\.(js|css|png|jpg|svg|woff2?)$/.test(url.pathname)
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Navigation / HTML: network-first with offline fallback
  event.respondWith(networkFirst(request, "/offline.html"));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return caches.match("/offline.html");
  }
}

async function networkFirst(request, fallbackUrl) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return (
      cached ||
      (fallbackUrl ? caches.match(fallbackUrl) : new Response("Offline", { status: 503 }))
    );
  }
}
