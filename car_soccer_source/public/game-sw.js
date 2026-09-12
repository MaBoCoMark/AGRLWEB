/**
 * Car Soccer PWA Service Worker
 * Handles offline caching and communication with the main thread.
 */

const CACHE_NAME = 'car-soccer-cache-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.kind === 'prepare-offline') {
    // Notify the main thread that offline preparation is complete
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ kind: 'offline-ready' });
    }
  }
});

self.addEventListener('fetch', (event) => {
  // Let network handle requests first, with cache fallback
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
