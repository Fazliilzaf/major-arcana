/* global self, caches, fetch, URL */
/* PWA shell — network-first for HTML/JS so deploys reach iPhone immediately */
const CACHE = "cco-staff-v2";

function isShellAsset(pathname) {
  return (
    pathname.endsWith(".css") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".png") ||
    pathname.endsWith("/manifest.json") ||
    pathname.endsWith("/icon.svg")
  );
}

function isNeverCache(pathname) {
  return (
    pathname.includes("app.bundle.") ||
    pathname.endsWith("/index.html") ||
    pathname.endsWith("/major-arcana-preview/") ||
    pathname.endsWith("/major-arcana-preview") ||
    pathname.endsWith("/service-worker.js")
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) return;
  if (isNeverCache(url.pathname)) {
    event.respondWith(fetch(event.request));
    return;
  }
  if (!isShellAsset(url.pathname)) {
    event.respondWith(fetch(event.request));
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && url.origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
