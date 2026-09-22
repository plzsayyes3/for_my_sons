const CACHE_NAME = 'for-my-sons-v18';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './apps.json',
  './manifest.webmanifest',
  './piano/?v=13',
  './piano/index.html?v=13',
  './split-puzzle/?v=4',
  './split-puzzle/index.html',
  './split-puzzle/styles.css?v=4',
  './split-puzzle/app.js?v=4',
  './paint/?v=3',
  './paint/index.html',
  './paint/styles.css?v=3',
  './paint/app.js?v=3',
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
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(SHELL.map((url) => cache.add(url)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const request = event.request;
  const sameOrigin = new URL(request.url).origin === self.location.origin;

  event.respondWith((async () => {
    try {
      const networkRequest = sameOrigin
        ? new Request(request, { cache: 'no-store' })
        : request;

      const response = await fetch(networkRequest);

      if (response && response.ok && sameOrigin) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone()).catch(() => {});
      }

      return response;
    } catch (error) {
      const cached =
        await caches.match(request, { ignoreSearch: false }) ||
        await caches.match(request, { ignoreSearch: true });

      if (cached) return cached;

      if (request.mode === 'navigate') {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }

      throw error;
    }
  })());
});
