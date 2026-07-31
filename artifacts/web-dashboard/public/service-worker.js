// Bumped to evict caches from the old cache-first-forever strategy below,
// which served /api/* GET responses (e.g. /api/v1/users/me) from cache
// indefinitely — never revalidating, so server-side state changes (like a
// newly-linked company) never reached clients until they manually cleared
// site data.
const CACHE_NAME = 'sitesnap-v2';
const urlsToCache = [
  '/',
  '/dashboard',
  '/index.html'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache).catch(() => {
          console.log('Cache addAll error - some resources may not be available offline yet');
        });
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);
  // Never cache API responses — they reflect live server/DB state (auth,
  // company membership, etc.) and must always hit the network.
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request).then(response => {
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });
          return response;
        });
      })
      .catch(() => {
        console.log('Fetch failed - using cached version if available');
      })
  );
});

console.log('Service Worker loaded');
