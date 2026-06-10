// Bump this version whenever the app shell changes to invalidate the old cache.
const CACHE_NAME = 'yearly-v24';
// Logo cache is intentionally never deleted on app updates — logos are stable per-merchant URL.
const LOGO_CACHE = 'yearly-logos-v1';

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
  './y/sync.jsx',
  './y/calc.jsx',
  './y/ui.jsx',
  './y/fun.jsx',
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
    caches.open(CACHE_NAME).then(cache =>
      // Individual fetches so one CORS/redirect failure (e.g. Access login redirect on
      // manifest.json) doesn't block the entire SW install. Same !redirected guard as
      // the fetch handler so an Access redirect can't poison the cache.
      Promise.all(PRECACHE.map(url =>
        fetch(url, { cache: 'no-cache' })
          .then(r => { if ((r.ok || r.type === 'opaque') && !r.redirected) return cache.put(url, r); })
          .catch(() => {})
      ))
    )
  );
  // Take over immediately so updates apply without waiting for old tabs to close.
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        // Keep LOGO_CACHE across version bumps — merchant logos never change per URL.
        keys.filter(k => k !== CACHE_NAME && k !== LOGO_CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Cache-first for merchant logos — once fetched, never go to network again.
function isLogoRequest(url) {
  return url.hostname === 'storage.googleapis.com' &&
    url.pathname.startsWith('/revolut-prod-apps_merchant-logo');
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/cdn-cgi/')) return;

  if (isLogoRequest(url)) {
    event.respondWith(
      caches.open(LOGO_CACHE).then(async (cache) => {
        const hit = await cache.match(event.request);
        if (hit) return hit;
        const res = await fetch(event.request).catch(() => null);
        if (res && (res.ok || res.type === 'opaque') && !res.redirected) {
          cache.put(event.request, res.clone());
        }
        return res || new Response('', { status: 503 });
      })
    );
    return;
  }

  // Network-first for the app shell.
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if ((response.ok || response.type === 'opaque') && !response.redirected) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
