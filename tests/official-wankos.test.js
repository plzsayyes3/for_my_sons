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
  assert.match(warPage, /official-wankos\.js\?v=4/);
  assert.match(libraryPage, /official-wankos\.js\?v=4/);
  assert.match(serviceWorker, new RegExp(`official-wankos/${id}\.wanko\.json\\?v=1`));
  assert.match(serviceWorker, new RegExp(`assets/official-wankos/${id}\.png\\?v=1`));
  assert.match(serviceWorker, /official-wankos\.js\?v=4/);
  assert.ok(apps.some(app => app.id === 'wanko-war' && /\?v=12$/.test(app.url)));
  assert.ok(apps.some(app => app.id === 'wanko-library' && /\?v=8$/.test(app.url)));
});
