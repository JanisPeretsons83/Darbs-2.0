// service-worker.js  (uzlabota Tava versija)
const PREFIX = 'worklog-cache-';
const CACHE  = 'worklog-cache-20260308-6'; // ↑ palielini, kad maini frontend failus

// Seko līdzi savām aktuālajām versijām (tās pašas, kas index.html <link> / <script>)
const ASSETS = [
  './',
  './index.html?v=20260308-6',
  './style.css?v=20260308-6',
  './worklog.js?v=20260308-6',
  './manifest.json?v=20260308-6',
  './icons/worklog-192.png',
  './icons/worklog-512.png',
  './offline.html' // ← pievieno nelielu fallback lapu
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith(PREFIX) && k !== CACHE)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// HTML pieprasījumiem — network-first ar offline fallback;
// citiem resursiem — stale-while-revalidate.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const accept = req.headers.get('accept') || '';
  const isHTML = accept.includes('text/html');

  if (isHTML) {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
          return res;
        })
        .catch(async () => (await caches.match(req)) || (await caches.match('./offline.html')))
    );
    return;
  }

  // Static: SWR
  e.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
