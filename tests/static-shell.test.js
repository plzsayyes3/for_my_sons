const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

async function installShell() {
  const listeners = new Map();
  const cacheNames = [];
  let installedUrls = [];
  const self = {
    location: { origin: 'https://example.test' },
    addEventListener: (name, handler) => listeners.set(name, handler),
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() }
  };
  const caches = {
    open: async name => {
      cacheNames.push(name);
      return { add: async url => { installedUrls.push(url); } };
    },
    keys: async () => [],
    delete: async () => true
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8'), {
    self, caches, Promise, URL, Request, fetch: async () => ({ ok: true })
  });
  let installPromise;
  listeners.get('install')({ waitUntil: promise => { installPromise = promise; } });
  await installPromise;
  return { cacheName: cacheNames[0], urls: installedUrls };
}

test('service worker installs every shell URL from real local files', async () => {
  const { urls } = await installShell();
  assert.ok(urls.length > 0);
  for (const url of urls) {
    const parsed = new URL(url, 'https://example.test/repo/');
    assert.equal(parsed.origin, 'https://example.test', `${url} must be same-origin`);
    const relative = decodeURIComponent(parsed.pathname.replace(/^\/repo\//, '').replace(/^\//, ''));
    const target = path.join(root, relative);
    const file = fs.existsSync(target) && fs.statSync(target).isDirectory()
      ? path.join(target, 'index.html')
      : target;
    assert.ok(fs.existsSync(file), `${url} should resolve to ${file}`);
  }
});

test('wanko app entries and service-worker shell point to current versioned pages', async () => {
  const apps = JSON.parse(fs.readFileSync(path.join(root, 'apps.json'), 'utf8'));
  const battle = apps.find(app => app.id === 'wanko-war');
  const library = apps.find(app => app.id === 'wanko-library');
  const shell = await installShell();
  assert.match(battle.url, /^\.\/wanko-war\/\?v=\d+$/);
  assert.match(library.url, /^\.\/wanko-library\/\?v=\d+$/);
  assert.ok(shell.urls.includes(battle.url));
  assert.ok(shell.urls.includes(library.url));
  for (const script of [
    './shared/wanko-game-data.js?v=2',
    './shared/wanko-game-progress.js?v=2',
    './shared/wanko-library-view.js?v=2',
    './shared/for-my-sons-db.js?v=1',
    './shared/profile-manager.js?v=1',
    './shared/parent-lock.js?v=1',
    './shared/save-store.js?v=1',
    './shared/github-sync.js?v=1',
    './shared/for-my-sons.js?v=1',
    './shared/settings-view.js?v=1',
    './shared/for-my-sons.css?v=1'
  ]) assert.ok(shell.urls.includes(script), `${script} must be cached`);
  assert.match(shell.cacheName, /v\d+$/);
  assert.equal(shell.urls.some(url => url.includes('api.github.com')), false);
  assert.equal(shell.cacheName, 'for-my-sons-v46');
});
