const VER = '20260222pdf1';
const CACHE = `worklog-cache-${VER}`;
const PREFIX = 'worklog-cache-';
const ASSETS = [
  './',
  `./index.html?v=${VER}`,
  `./style.css?v=${VER}`,
  `./worklog.js?v=${VER}`,
  `./manifest.json?v=${VER}`,
  './icons/worklog-192.png',
  './icons/worklog-512.png'
];
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match(`./index.html?v=${VER}`))
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(res => res || fetch(req))
  );
});
