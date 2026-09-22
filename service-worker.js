const CACHE_NAME = 'for-my-sons-v15';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './apps.json',
  './manifest.webmanifest',
  './piano/?v=12',
  './piano/index.html?v=12',
  './split-puzzle/?v=1',
  './split-puzzle/index.html',
  './split-puzzle/styles.css',
  './split-puzzle/app.js',
  './paint/?v=1',
  './paint/index.html',
  './paint/styles.css',
  './paint/app.js',
  './assets/for-my-sons-icon.svg',
  './assets/kids-3d.svg',
  './assets/minecraft-english.svg',
  './assets/piano.svg',
  './assets/typing.svg',
  './assets/pressure.svg',
  './assets/roulette.svg',
  './assets/step-up.svg',
  './assets/match3.svg',
  './assets/space-survival.svg',
  './assets/split-puzzle.svg',
  './assets/paint.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
  );
});
