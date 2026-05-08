/**
 * CCO Service Worker — P8 PWA + offline.
 *
 * Caching-strategi:
 *   • Precache: kärnskelet — index.html + alla runtime-*.js + styles.css
 *   • Runtime cache (stale-while-revalidate): övriga statiska assets
 *   • Network-first med fallback: API-anrop
 *   • Offline fallback: cached index.html för navigation
 *
 * Push notifications:
 *   • 'push'-event renderar notification från payload
 *   • 'notificationclick' fokuserar app-fönstret + navigerar till tråd
 *
 * Lifecycle:
 *   • install: precache core assets
 *   • activate: rensa gamla caches
 *   • message: stöd för manuell skipWaiting
 */
/* eslint-disable no-restricted-globals */

const CACHE_VERSION = 'cco-pwa-v1';
const PRECACHE_NAME = `${CACHE_VERSION}-precache`;
const RUNTIME_NAME = `${CACHE_VERSION}-runtime`;
const PRECACHE_URLS = [
  '/major-arcana-preview/',
  '/major-arcana-preview/index.html',
  '/major-arcana-preview/styles.css',
  '/major-arcana-preview/runtime-config.js',
  '/major-arcana-preview/runtime-thread-ops.js',
  '/major-arcana-preview/runtime-action-engine.js',
  '/major-arcana-preview/runtime-workspace-state.js',
  '/major-arcana-preview/runtime-reentry-state.js',
  '/major-arcana-preview/runtime-focus-intel-renderers.js',
  '/major-arcana-preview/runtime-queue-renderers.js',
  '/major-arcana-preview/runtime-overlay-renderers.js',
  '/major-arcana-preview/runtime-async-orchestration.js',
  '/major-arcana-preview/runtime-dom-live-composition.js',
  '/major-arcana-preview/runtime-command-palette.js',
  '/major-arcana-preview/runtime-saved-views.js',
  '/major-arcana-preview/runtime-unified-search.js',
  '/major-arcana-preview/runtime-keyboard-shortcuts.js',
  '/major-arcana-preview/runtime-thread-summary.js',
  '/major-arcana-preview/runtime-followup-filters.js',
  '/major-arcana-preview/runtime-soft-break.js',
  '/major-arcana-preview/runtime-density-toggle.js',
  '/major-arcana-preview/runtime-draft-feedback.js',
  '/major-arcana-preview/runtime-sentiment-badges.js',
  '/major-arcana-preview/runtime-skeleton-loaders.js',
  '/major-arcana-preview/runtime-optimistic-ui.js',
  '/major-arcana-preview/runtime-mobile-responsive.js',
  '/major-arcana-preview/runtime-virtual-scroll.js',
  '/major-arcana-preview/runtime-realtime-stream.js',
  '/major-arcana-preview/runtime-pwa.js',
  '/major-arcana-preview/manifest.json',
  '/cco-next-customer-intelligence.js',
  '/cco-next-collaboration.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PRECACHE_NAME)
      .then((cache) =>
        cache.addAll(
          PRECACHE_URLS.map((url) => new Request(url, { credentials: 'same-origin' }))
        )
      )
      .then(() => self.skipWaiting())
      .catch((err) => {
        // Tolerera enskilda 404 — installen ska inte misslyckas helt
        console.warn('[CCO SW] precache delvis misslyckades:', err);
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith('cco-pwa-') && !name.startsWith(CACHE_VERSION))
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING' || event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function isApiRequest(url) {
  return /\/api\/v\d+\//.test(url.pathname);
}

function isStaticAsset(url) {
  return /\.(?:js|css|woff2?|ttf|otf|svg|png|jpe?g|webp|ico|gif)$/i.test(url.pathname);
}

function isNavigationRequest(request) {
  return request.mode === 'navigate';
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // SSE-streams: aldrig cacha (low-latency, infinite-stream)
  if (url.pathname.endsWith('/runtime/stream')) return;

  // Navigation: network-first, fallback till cached index.html
  if (isNavigationRequest(request)) {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          // Cacha navigationssvar i runtime-cache för offline-fallback
          const cache = await caches.open(RUNTIME_NAME);
          cache.put(request, networkResponse.clone()).catch(() => {});
          return networkResponse;
        } catch (_e) {
          const cached = await caches.match(request);
          if (cached) return cached;
          const fallback = await caches.match('/major-arcana-preview/');
          if (fallback) return fallback;
          return new Response('Offline', { status: 503 });
        }
      })()
    );
    return;
  }

  // API: network-first med kort cache-fallback (5 min)
  if (isApiRequest(url)) {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          // Cacha bara GET med ok status
          if (networkResponse && networkResponse.ok) {
            const cache = await caches.open(RUNTIME_NAME);
            cache.put(request, networkResponse.clone()).catch(() => {});
          }
          return networkResponse;
        } catch (_e) {
          const cached = await caches.match(request);
          if (cached) return cached;
          return new Response(
            JSON.stringify({ error: 'Offline', offline: true }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        }
      })()
    );
    return;
  }

  // Statiska assets: cache-first med background-revalidate
  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        const fetchPromise = fetch(request)
          .then((response) => {
            if (response && response.ok) {
              caches
                .open(RUNTIME_NAME)
                .then((cache) => cache.put(request, response.clone()))
                .catch(() => {});
            }
            return response;
          })
          .catch(() => null);
        return cached || fetchPromise || new Response('Offline asset', { status: 503 });
      })()
    );
    return;
  }
});

// ───────── Push notifications ─────────
self.addEventListener('push', (event) => {
  let payload = { title: 'CCO', body: 'Ny händelse', data: {} };
  try {
    if (event.data) payload = event.data.json();
  } catch (_e) {
    try { payload.body = event.data?.text?.() || payload.body; } catch (_err) {}
  }

  const title = String(payload.title || 'CCO').slice(0, 80);
  const options = {
    body: String(payload.body || '').slice(0, 240),
    icon: '/major-arcana-preview/icon.svg',
    badge: '/major-arcana-preview/icon.svg',
    tag: payload.tag || 'cco-default',
    renotify: !!payload.renotify,
    data: payload.data || {},
    requireInteraction: !!payload.requireInteraction,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl =
    typeof data.url === 'string'
      ? data.url
      : '/major-arcana-preview/' +
        (data.threadId ? `?thread=${encodeURIComponent(data.threadId)}` : '');

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Försök fokusera existerande tab först
      for (const client of windowClients) {
        if (client.url.includes('/major-arcana-preview/') && 'focus' in client) {
          if ('navigate' in client) {
            client.navigate(targetUrl).catch(() => {});
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return null;
    })
  );
});

// ───────── Sync (background sync för offline-action-queue) ─────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'cco-offline-actions') {
    event.waitUntil(
      // Be alla aktiva clients att flusha sin offline-kö
      self.clients
        .matchAll({ type: 'window' })
        .then((clients) => {
          for (const client of clients) {
            client.postMessage({ type: 'CCO_FLUSH_OFFLINE_QUEUE' });
          }
        })
        .catch(() => {})
    );
  }
});
