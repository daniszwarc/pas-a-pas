// Bump CACHE when any cached file changes, otherwise clients keep the old copy.
const CACHE = 'pas-a-pas-v8';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'js/app.js',
  'js/steps.js',
  'js/voice.js',
  'js/storage.js',
  'js/ui.js',
  'data/problems.fr.json',
  'data/audio-manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(async (cache) => {
        await cache.addAll(SHELL);
        // The recordings are listed in the manifest. A file that fails to download must not block the install:
        // the app falls back to the system voice for it.
        const manifest = await (await cache.match('data/audio-manifest.json')).json();
        const files = Object.values(manifest.problems).flatMap((e) => [...e.chunks, e.question, ...e.asked, e.explanation].map((r) => r.file));
        await Promise.allSettled([...new Set(files)].map((f) => cache.add(f)));
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(request).catch(() =>
        request.mode === 'navigate' ? caches.match('index.html') : Response.error()
      );
    })
  );
});
