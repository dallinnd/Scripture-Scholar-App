const CACHE_NAME = 'scripture-helper-v9';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './standard_works.txt',
  './manifest.json'
];

// Install Event: Cache all files
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    })
  );
});

// Fetch Event: Serve from Cache, fall back to Network
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then(response => {
      return response || fetch(e.request);
    })
  );
});

// Activate Event: Clean up old caches (v8, v7, etc.)
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
});
