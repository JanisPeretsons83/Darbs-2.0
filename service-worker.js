const CACHE = 'worklog-cache-20260214155642';
const PREFIX = 'worklog-cache-';
const ASSETS = [
  './',
  './index.html?v=20260214155642',
  './style.css?v=20260214155642',
  './worklog.js?v=20260214155642',
  './manifest.json?v=20260214155642',
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
  e.respondWith(
    caches.match(e.request).then(res => res || fetch(e.request))
  );
});
