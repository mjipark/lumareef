// LumaReef Service Worker
// Caches all static assets for offline use so the app works without internet.

const CACHE_NAME = 'lumareef-v1';

// All files to pre-cache on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/journal.js',
  '/tank.js',
  '/islands.js',
  '/agent.js',
  '/chat.js',
  '/guide.js',
  '/sentiment.js',
  '/manifest.json',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/assets/note.png',
  '/assets/Island.png',
  '/assets/f1.png',
  '/assets/f2.png',
  '/assets/f3.png',
  '/assets/f4.png',
  '/assets/f5.png',
  '/assets/f6.png',
  '/assets/ttt_1.png',
  '/assets/ttt_2.png',
  '/assets/ttt_3.png',
  '/assets/cube-float-1.png',
  '/assets/cube-float-2.png',
  '/assets/cube-float-3.png',
  '/assets/cube-float-4.png',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js'
];

// Install: pre-cache all static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate: delete old caches from previous versions
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: serve from cache first, fall back to network (cache-first strategy)
self.addEventListener('fetch', event => {
  // Skip non-GET requests and chrome-extension URLs
  if (event.request.method !== 'GET') return;
  if (event.request.url.startsWith('chrome-extension://')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      // Not in cache — fetch from network and cache a copy
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const toCache = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, toCache));
        return response;
      }).catch(() => {
        // Offline fallback for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
