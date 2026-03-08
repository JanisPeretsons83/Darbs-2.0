// service-worker.js — v20260308-7 (Navigation Preload + drošāks fetch)
const PREFIX = 'worklog-cache-';
const CACHE  = 'worklog-cache-20260308-7'; // ↑ paceļ, kad maini frontend

const ASSETS = [
  './',
  './index.html?v=20260308-7',
  './style.css?v=20260308-7',
  './worklog.js?v=20260308-7',
  './manifest.json?v=20260308-7',
  './icons/worklog-192.png',
  './icons/worklog-512.png',
  './offline.html'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(k => k.startsWith(PREFIX) && k !== CACHE)
      .map(k => caches.delete(k)));
    // Navigation Preload = ātrāks sākums HTML navigācijām
    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable();
    }
    await self.clients.claim();
  })());
});

// HTML → network-first ar navigation preload; statika → SWR;
// tikai GET + same-origin kešojam.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const accept = req.headers.get('accept') || '';
  const isHTML = accept.includes('text/html');

  if (isHTML) {
    event.respondWith((async () => {
      try {
        const pre = await event.preloadResponse;
        if (pre) {
          caches.open(CACHE).then(c => c.put(req, pre.clone()));
          return pre;
        }
        const net = await fetch(req);
        caches.open(CACHE).then(c => c.put(req, net.clone()));
        return net;
      } catch {
        return (await caches.match(req)) || (await caches.match('./offline.html'));
      }
    })());
    return;
  }

  // Static: SWR
  event.respondWith((async () => {
    const cached = await caches.match(req);
    const promised = fetch(req)
      .then(res => { caches.open(CACHE).then(c => c.put(req, res.clone())); return res; })
      .catch(() => cached);
    return cached || promised;
  })());
});
