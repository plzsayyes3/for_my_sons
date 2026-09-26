const test = require('node:test');
const assert = require('node:assert/strict');
const { createWankoLibraryStore } = require('../shared/wanko-library-store.js');

function memoryAdapter(initial = []) {
  const copy = value => structuredClone(value);
  const records = new Map(initial.map(record => [record.id, structuredClone(record)]));
  const meta = new Map();
  const writes = [];
  return {
    writes,
    async get(store, key) {
      if (store === 'wankos') return structuredClone(records.get(key) || null);
      return structuredClone(meta.get(key) || null);
    },
    async put(store, value, key) {
      writes.push({ store, key, value: structuredClone(value) });
      if (store === 'wankos') records.set(key, structuredClone(value));
      else meta.set(key, structuredClone(value));
      return structuredClone(value);
    },
    async list(store) {
      return store === 'wankos' ? [...records.values()].map(copy) : [...meta.values()].map(copy);
    },
    record(id) { return structuredClone(records.get(id) || null); }
  };
}

function wanko(id, createdAt) {
  return { id, name: id, createdAt, updatedAt: createdAt, blob: new Uint8Array([1]), archived: false };
}

test('registerWanko preserves the character request ID without request data', async () => {
  const adapter = memoryAdapter();
  const store = createWankoLibraryStore({ db: adapter, clock: () => Date.parse('2026-09-26T00:00:00.000Z') });

  const result = await store.registerWanko({
    name: '依頼わんこ',
    blob: new Uint8Array([1, 2]),
    creator: 'paint',
    characterRequestId: 'request-custom-1'
  });

  assert.equal(result.characterRequestId, 'request-custom-1');
  assert.equal('requestJson' in result, false);
  assert.equal('requestArtwork' in result, false);
});

test('archiveWanko hides the record and switches the active wanko safely', async () => {
  const adapter = memoryAdapter([wanko('first', '2026-09-25T00:00:00.000Z'), wanko('second', '2026-09-26T00:00:00.000Z')]);
  const store = createWankoLibraryStore({ db: adapter, clock: () => Date.parse('2026-09-27T00:00:00.000Z') });
  await store.setActiveWanko('second');

  const archived = await store.archiveWanko('second');

  assert.equal(archived.archived, true);
  assert.equal(adapter.record('second').archived, true);
  assert.deepEqual((await store.listWankos()).map(record => record.id), ['first']);
  assert.equal((await store.getActiveWanko()).id, 'first');
});

test('archiveWanko clears active state when no local wanko remains', async () => {
  const adapter = memoryAdapter([wanko('only', '2026-09-25T00:00:00.000Z')]);
  const store = createWankoLibraryStore({ db: adapter });
  await store.setActiveWanko('only');

  await store.archiveWanko('only');

  assert.equal(await store.getActiveWanko(), null);
  assert.equal((await adapter.get('meta', 'activeWankoId')).value, null);
});

test('archiving never writes to a separate character request store', async () => {
  const adapter = memoryAdapter([wanko('request-linked', '2026-09-25T00:00:00.000Z')]);
  const store = createWankoLibraryStore({ db: adapter });
  await store.archiveWanko('request-linked');

  assert.equal(adapter.writes.some(write => write.store === 'characterRequests'), false);
});
