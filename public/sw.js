// Offline + fast repeat visits. The pose AI files are cached forever (their
// folder name carries the version); the app shell is network-first; the API is
// never cached here.
const CACHE = 'repdle-v3';
const SHELL = ['/', '/app.css', '/config.js', '/challenges.json', '/js/app.js', '/js/api.js', '/js/day.js', '/js/gravity.js', '/js/grid.js', '/js/id.js', '/js/pose.js', '/js/reps.js', '/js/rules.js', '/js/session.js', '/js/stats.js', '/js/store.js', '/js/ui.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/vendor/') || url.pathname.startsWith('/models/')) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    })));
    return;
  }
  // SPA routes (/d/…, /l/…) fall back to the cached shell when offline.
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request).then((hit) => hit || (e.request.mode === 'navigate' ? caches.match('/') : Response.error()))));
});
