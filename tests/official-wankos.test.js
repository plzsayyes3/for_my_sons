const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const id = 'nen-o-kometa-snake';
const metadataPath = path.join(root, 'official-wankos', `${id}.wanko.json`);
const assetPath = path.join(root, 'assets', 'official-wankos', `${id}.png`);

test('registers 念を込めたスネーク as an official ally with its submitted stats', () => {
  assert.ok(fs.existsSync(metadataPath), 'official metadata should exist');
  assert.ok(fs.existsSync(assetPath), 'official image asset should exist');

  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  assert.equal(metadata.id, id);
  assert.equal(metadata.name, '念を込めたスネーク');
  assert.equal(metadata.faction, 'ally');
  assert.equal(metadata.renderScale, 1);
  assert.deepEqual(metadata.stats, {
    cost: 180,
    hp: 140,
    damage: 30,
    speed: 46,
    range: 44,
    cooldown: 0.72
  });
});

test('exposes 念を込めたスネーク through the official catalog and PWA shell', () => {
  const catalog = fs.readFileSync(path.join(root, 'shared', 'official-wankos.js'), 'utf8');
  const serviceWorker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
  const warPage = fs.readFileSync(path.join(root, 'wanko-war', 'index.html'), 'utf8');
  const libraryPage = fs.readFileSync(path.join(root, 'wanko-library', 'index.html'), 'utf8');
  const apps = JSON.parse(fs.readFileSync(path.join(root, 'apps.json'), 'utf8'));

  assert.match(catalog, new RegExp(`id: "${id}"`));
  assert.match(warPage, /official-wankos\.js\?v=5/);
  assert.match(libraryPage, /official-wankos\.js\?v=5/);
  assert.match(serviceWorker, new RegExp(`official-wankos/${id}\.wanko\.json\\?v=1`));
  assert.match(serviceWorker, new RegExp(`assets/official-wankos/${id}\.png\\?v=1`));
  assert.match(serviceWorker, /official-wankos\.js\?v=5/);
  assert.ok(apps.some(app => app.id === 'wanko-war' && /\?v=13$/.test(app.url)));
  assert.ok(apps.some(app => app.id === 'wanko-library' && /\?v=9$/.test(app.url)));
});

test('registers 爆発玉 as a low-cost high-damage self-destructing ally', () => {
  const id = 'bakuhatsu-dama';
  const metadataPath = path.join(root, 'official-wankos', `${id}.wanko.json`);
  const assetPath = path.join(root, 'assets', 'official-wankos', `${id}.png`);
  assert.ok(fs.existsSync(metadataPath), 'exploding ally metadata should exist');
  assert.ok(fs.existsSync(assetPath), 'exploding ally image should exist');

  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  assert.equal(metadata.name, '爆発玉');
  assert.equal(metadata.faction, 'ally');
  assert.equal(metadata.renderScale, 1);
  assert.deepEqual(metadata.stats, {
    cost: 90,
    hp: 80,
    damage: 150,
    speed: 38,
    range: 58,
    cooldown: 0.9
  });
  assert.deepEqual(metadata.behavior, {
    selfDestruct: true,
    splashRadius: 72,
    maxTargets: 3,
    explosionParticles: true
  });
});

test('wanko war contains the self-destruct area-attack and particle hooks', () => {
  const catalog = fs.readFileSync(path.join(root, 'shared', 'official-wankos.js'), 'utf8');
  const warPage = fs.readFileSync(path.join(root, 'wanko-war', 'index.html'), 'utf8');
  const serviceWorker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');

  assert.match(catalog, /id: "bakuhatsu-dama"/);
  assert.match(warPage, /selfDestruct/);
  assert.match(warPage, /splashRadius/);
  assert.match(warPage, /explosion-particle/);
  assert.match(serviceWorker, /official-wankos\/bakuhatsu-dama\.wanko\.json\?v=1/);
  assert.match(serviceWorker, /assets\/official-wankos\/bakuhatsu-dama\.png\?v=1/);
});
