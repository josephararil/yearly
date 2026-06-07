// Bump this version whenever the app shell changes to invalidate the old cache.
const CACHE_NAME = 'yearly-v6';

const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-maskable.svg',
  './y/tokens.css',
  './y/app.css',
  './y/icons.jsx',
  './y/ds.jsx',
  './y/data.jsx',
  './y/calc.jsx',
  './y/ui.jsx',
  './y/home.jsx',
  './y/addflow.jsx',
  './y/analysis.jsx',
  './y/settings.jsx',
  './y/app.jsx',
  // CDN deps — pinned versions; must match index.html exactly
  'https://unpkg.com/react@18.3.1/umd/react.development.js',
  'https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js',
  'https://unpkg.com/@babel/standalone@7.29.0/babel.min.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE))
  );
  // Take over immediately so updates apply without waiting for old tabs to close.
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Network-first: always try the network; only serve from cache when offline.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok || response.type === 'opaque') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
