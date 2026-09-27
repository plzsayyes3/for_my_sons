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
  assert.equal(metadata.renderScale, 2);
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
  assert.match(warPage, /official-wankos\.js\?v=9/);
  assert.match(libraryPage, /official-wankos\.js\?v=9/);
  assert.match(serviceWorker, new RegExp(`official-wankos/${id}\.wanko\.json\\?v=2`));
  assert.match(serviceWorker, new RegExp(`assets/official-wankos/${id}\.png\\?v=1`));
  assert.match(serviceWorker, /official-wankos\.js\?v=9/);
  assert.ok(apps.some(app => app.id === 'wanko' && /\?v=13$/.test(app.url)));
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
  assert.equal(metadata.renderScale, 2);
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
  assert.match(serviceWorker, /official-wankos\/bakuhatsu-dama\.wanko\.json\?v=2/);
  assert.match(serviceWorker, /assets\/official-wankos\/bakuhatsu-dama\.png\?v=1/);
});

test('registers ハンマー as an official ally with the submitted standard stats', () => {
  const id = 'hammer';
  const metadataPath = path.join(root, 'official-wankos', `${id}.wanko.json`);
  const assetPath = path.join(root, 'assets', 'official-wankos', `${id}.png`);
  assert.ok(fs.existsSync(metadataPath), 'hammer metadata should exist');
  assert.ok(fs.existsSync(assetPath), 'hammer image should exist');

  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  assert.equal(metadata.name, 'ハンマー');
  assert.equal(metadata.faction, 'ally');
  assert.equal(metadata.renderScale, 2);
  assert.deepEqual(metadata.stats, {
    cost: 180,
    hp: 140,
    damage: 30,
    speed: 46,
    range: 44,
    cooldown: 0.72
  });
});

test('exposes ハンマー in the official catalog and PWA shell', () => {
  const catalog = fs.readFileSync(path.join(root, 'shared', 'official-wankos.js'), 'utf8');
  const serviceWorker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
  assert.match(catalog, /id: "hammer"/);
  assert.match(serviceWorker, /official-wankos\/hammer\.wanko\.json\?v=2/);
  assert.match(serviceWorker, /assets\/official-wankos\/hammer\.png\?v=1/);
});

test('uses the standard 2.0 display scale for every original official character', () => {
  const metadataFiles = fs.readdirSync(path.join(root, 'official-wankos'))
    .filter(file => file.endsWith('.wanko.json'));
  assert.ok(metadataFiles.length >= 7);
  for (const file of metadataFiles) {
    const metadata = JSON.parse(fs.readFileSync(path.join(root, 'official-wankos', file), 'utf8'));
    assert.equal(metadata.renderScale, 2, `${file} should use renderScale 2`);
  }
});


test('official catalog script remains valid JavaScript', () => {
  const catalog = fs.readFileSync(path.join(root, 'shared', 'official-wankos.js'), 'utf8');
  assert.doesNotThrow(() => new Function(catalog));
});


test('registers the four child-request allies in the official catalog', () => {
  const catalog = fs.readFileSync(path.join(root, 'shared', 'official-wankos.js'), 'utf8');
  const serviceWorker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
  const expected = [
    ['nagaashi', '強裏長足', null],
    ['big-monster', 'ビックな怪物', null],
    ['dorisha', 'ドリ車', 'dorisha.png'],
    ['ebifurai-fura', 'エビフライフラ', 'ebifurai-fura.png']
  ];
  for (const [id, name, asset] of expected) {
    const metadataPath = path.join(root, 'official-wankos', id + '.wanko.json');
    assert.ok(fs.existsSync(metadataPath), id + ' metadata should exist');
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    assert.equal(metadata.id, id);
    assert.equal(metadata.name, name);
    assert.equal(metadata.faction, 'ally');
    assert.equal(metadata.renderScale, 2);
    assert.match(catalog, new RegExp('id: "' + id + '"'));
    assert.match(serviceWorker, new RegExp('official-wankos/' + id + '\\.wanko\\.json\\?v=1'));
    if (asset) {
      assert.ok(fs.existsSync(path.join(root, 'assets', 'official-wankos', asset)), asset + ' should exist');
      assert.match(serviceWorker, new RegExp('assets/official-wankos/' + asset.replace('.', '\\.') + '\\?v=1'));
    } else {
      assert.ok(metadata.placeholder, id + ' should retain a placeholder until artwork is resubmitted');
      assert.equal(metadata.imagePath, undefined);
    }
  }
});
