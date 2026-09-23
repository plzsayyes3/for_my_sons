const CACHE_NAME = 'for-my-sons-v42';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js?v=2',
  './apps.json',
  './manifest.webmanifest',
  './piano/?v=14',
  './piano/index.html?v=14',
  './split-puzzle/?v=6',
  './split-puzzle/index.html',
  './split-puzzle/styles.css?v=6',
  './split-puzzle/app.js?v=6',
  './merge-block/?v=11',
  './merge-block/index.html',
  './merge-block/styles.css?v=10',
  './merge-block/app.js?v=11',
  './wanko-war/?v=10',
  './wanko-war/index.html',
  './wanko-library/?v=6',
  './wanko-library/index.html',
  './official-wankos/futsuu-no-wanko.wanko.json?v=3',
  './official-wankos/naganeko.wanko.json?v=2',
  './official-wankos/inusensha.wanko.json?v=1',
  './wanko-cloud/?v=1',
  './wanko-cloud/index.html',
  './shared/wanko-cloud-config.js',
  './shared/wanko-cloud.js',
  './shared/official-wankos.js?v=3',
  './shared/wanko-library.js',
  './paint/?v=6',
  './paint/index.html',
  './paint/styles.css?v=4',
  './paint/app.js?v=5',
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
  './assets/merge-block.svg?v=2',
  './assets/wanko-war.svg?v=1',
  './assets/wanko-library.svg?v=1',
  './assets/official-wankos/futsuu-no-wanko.svg?v=2',
  './assets/official-wankos/naganeko.svg?v=1',
  './assets/official-wankos/inusensha.webp?v=1',
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
