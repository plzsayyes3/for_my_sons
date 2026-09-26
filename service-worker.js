const CACHE_NAME = 'for-my-sons-v70';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js?v=3',
  './apps.json',
  './manifest.webmanifest',
  './shared/for-my-sons-db.js?v=2',
  './shared/profile-manager.js?v=2',
  './shared/parent-lock.js?v=3',
  './shared/save-store.js?v=2',
  './shared/github-sync.js?v=8',
  './shared/character-requests.js?v=1',
  './shared/for-my-sons.js?v=9',
  './shared/settings-view.js?v=6',
  './shared/for-my-sons.css?v=3',
  './kids-3d-playgrand/?v=5',
  './kids-3d-playgrand/index.html?v=5',
  './kids-3d-playgrand/manual.html?v=5',
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
  './wanko/?v=10',
  './wanko/index.html',
  './wanko-war/?v=21',
  './wanko-war/index.html',
  './wanko-gacha/?v=5',
  './wanko-gacha/index.html',
  './wanko-mini/?v=4',
  './wanko-mini/index.html',
  './wanko-mini/addition/?v=4',
  './wanko-mini/addition/index.html',
  './wanko-mini/subtraction/?v=2',
  './wanko-mini/subtraction/index.html',
  './wanko-mini/multiplication/?v=3',
  './wanko-mini/multiplication/index.html',
  './wanko-library/?v=18',
  './wanko-library/index.html',
  './official-wankos/futsuu-no-wanko.wanko.json?v=4',
  './official-wankos/naganeko.wanko.json?v=3',
  './official-wankos/inusensha.wanko.json?v=2',
  './official-wankos/kurionen.wanko.json?v=2',
  './official-wankos/nen-o-kometa-snake.wanko.json?v=2',
  './official-wankos/bakuhatsu-dama.wanko.json?v=2',
  './official-wankos/hammer.wanko.json?v=2',
  './wanko-cloud/?v=1',
  './wanko-cloud/index.html',
  './shared/wanko-cloud-config.js',
  './shared/wanko-cloud.js',
  './shared/official-wankos.js?v=8',
  './shared/wanko-library-store.js?v=1',
  './shared/wanko-library.js',
  './shared/wanko-game-data.js?v=3',
  './shared/wanko-game-progress.js?v=7',
  './shared/wanko-profile-sync.js?v=1',
  './shared/wanko-mini-addition.js?v=2',
  './shared/wanko-mini-subtraction.js?v=1',
  './shared/wanko-mini-multiplication.js?v=1',
  './shared/wanko-library-view.js?v=3',
  './shared/wanko-registration-request.js?v=1',
  './paint/?v=7',
  './paint/index.html',
  './paint/styles.css?v=5',
  './paint/app.js?v=7',
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
  './assets/wanko-gacha.svg?v=1',
  './assets/gacha-effects/orb.svg?v=1',
  './assets/gacha-effects/confetti.svg?v=1',
  './assets/gacha-effects/spark.svg?v=1',
  './assets/gacha-effects/star.svg?v=1',
  './assets/wanko-library.svg?v=1',
  './assets/official-wankos/futsuu-no-wanko.svg?v=2',
  './assets/official-wankos/naganeko.svg?v=1',
  './assets/official-wankos/inusensha.webp?v=1',
  './assets/official-wankos/kurionen.webp?v=1',
  './assets/official-wankos/nen-o-kometa-snake.png?v=1',
  './assets/official-wankos/bakuhatsu-dama.png?v=1',
  './assets/official-wankos/hammer.png?v=1',
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
