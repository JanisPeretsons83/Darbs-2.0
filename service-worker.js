// service-worker.js — v20260308-10

const VERSION = '20260308-10';
const PREFIX  = 'worklog-cache-';
const CACHE   = `${PREFIX}${VERSION}`;

const ASSETS = [
  './',
  `./index.html?v=${VERSION}`,
  `./style.css?v=${VERSION}`,
  `./worklog.js?v=${VERSION}`,
  `./manifest.json?v=${VERSION}`,
  './icons/worklog-192.png',
  './icons/worklog-512.png',
  './offline.html'
];

// ===== Install =====
self.addEventListener('install', (event) => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
  );
});

// ===== Activate =====
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {

    const keys = await caches.keys();

    await Promise.all(
      keys
        .filter(key => key.startsWith(PREFIX) && key !== CACHE)
        .map(key => caches.delete(key))
    );

    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable();
    }

    await self.clients.claim();

  })());
});

// ===== Fetch =====
self.addEventListener('fetch', (event) => {

  const req = event.request;

  // Tikai GET
  if (req.method !== 'GET') {
    return;
  }

  const url = new URL(req.url);

  // Tikai savas lapas resursi
  if (url.origin !== self.location.origin) {
    return;
  }

  const isNavigation = req.mode === 'navigate';

  // ========================
  // HTML → Network First
  // ========================
  if (isNavigation) {

    event.respondWith((async () => {

      try {

        const preload = await event.preloadResponse;

        if (preload) {

          if (preload.ok) {
            const cache = await caches.open(CACHE);
            await cache.put(req, preload.clone());
          }

          return preload;
        }

        const networkResponse = await fetch(req);

        if (networkResponse.ok) {
          const cache = await caches.open(CACHE);
          await cache.put(req, networkResponse.clone());
        }

        return networkResponse;

      } catch (err) {

        const cached = await caches.match(req);

        if (cached) {
          return cached;
        }

        const offline = await caches.match('./offline.html');

        if (offline) {
          return offline;
        }

        return new Response(
          'Offline',
          {
            status: 503,
            headers: {
              'Content-Type': 'text/plain; charset=utf-8'
            }
          }
        );
      }

    })());

    return;
  }

  // ========================
  // Static assets → SWR
  // ========================
  event.respondWith((async () => {

    const cached = await caches.match(req);

    const networkPromise = fetch(req)
      .then(async (response) => {

        if (response && response.ok) {
          const cache = await caches.open(CACHE);
          await cache.put(req, response.clone());
        }

        return response;
      })
      .catch(() => cached);

    return cached || networkPromise;

  })());
});
