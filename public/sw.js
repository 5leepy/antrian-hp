const CACHE_NAME = 'ev-queue-pwa-cache-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // PWA requires a fetch handler to be recognized as installable.
  // Minimal passthrough without complex caching to avoid staleness.
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
