const test = require('node:test');
const assert = require('node:assert/strict');
const { createSaveStore } = require('../shared/save-store.js');

function memoryAdapter() {
  const records = new Map();
  return {
    records,
    async get(key) { return records.get(key) || null; },
    async put(key, value) { records.set(key, value); },
    async list() { return [...records.values()]; }
  };
}

test('separates data by profile, app, and key and increments revisions', async () => {
  const store = createSaveStore(memoryAdapter());
  assert.equal(await store.get('child-a', 'wanko-war', 'progress'), null);
  assert.equal((await store.put('child-a', 'wanko-war', 'progress', { wins: 2 })).revision, 1);
  assert.equal((await store.put('child-a', 'wanko-war', 'progress', { wins: 3 })).revision, 2);
  await store.put('child-b', 'wanko-war', 'progress', { wins: 0 });
  await store.put('child-a', 'drawing', 'progress', { wins: 9 });
  assert.deepEqual((await store.get('child-a', 'wanko-war', 'progress')).value, { wins: 3 });
  assert.deepEqual((await store.get('child-b', 'wanko-war', 'progress')).value, { wins: 0 });
  assert.deepEqual((await store.get('child-a', 'drawing', 'progress')).value, { wins: 9 });
});

test('lists pending records and round-trips binary blobs without base64 conversion', async () => {
  const store = createSaveStore(memoryAdapter());
  await store.put('child-a', 'wanko-war', 'progress', { wins: 1 });
  const blob = new Blob(['drawing-data'], { type: 'application/octet-stream' });
  await store.putBlob('child-a', 'drawing', 'artwork', blob);
  assert.equal(await (await store.getBlob('child-a', 'drawing', 'artwork')).text(), 'drawing-data');
  const pending = await store.listPending('child-a');
  assert.deepEqual(pending.map(item => item.key).sort(), ['artwork', 'progress']);
});

test('rejects unsafe identifiers and app/key path delimiters', async () => {
  const store = createSaveStore(memoryAdapter());
  for (const args of [
    ['../bad', 'game', 'key'], ['child-a', '../game', 'key'], ['child-a', 'game', 'a/b']
  ]) await assert.rejects(store.put(...args, {}));
});
