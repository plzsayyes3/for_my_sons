const test = require('node:test');
const assert = require('node:assert/strict');
const { createMemoryDatabase } = require('../shared/for-my-sons-db.js');
const { createProfileManager } = require('../shared/profile-manager.js');
const { createSaveStore } = require('../shared/save-store.js');

async function setup() {
  const db = createMemoryDatabase();
  const profiles = createProfileManager(db);
  await profiles.current();
  return { db, profiles, store: createSaveStore(db, profiles, { now: () => 1700000000000 }) };
}

test('writes and reads cloned JSON values per current profile', async () => {
  const { profiles, store } = await setup();
  const value = { score: 4, levels: ['S001'] };
  const record = await store.writeJson('merge-block', 'progress', value);
  value.levels.push('mutated');
  assert.deepEqual(await store.readJson('merge-block', 'progress'), { score: 4, levels: ['S001'] });
  assert.equal(record.profileId, 'profile-1');
  assert.equal(record.localRevision, 1);
  assert.equal(record.dirty, true);
  assert.equal(record.syncState, 'pending');

  await profiles.setCurrent('profile-2');
  assert.equal(await store.readJson('merge-block', 'progress'), null);
});

test('round-trips binary values and builds safe repository paths', async () => {
  const { store } = await setup();
  await store.writeBinary('profile', 'avatar', Uint8Array.from([1, 2, 3]), 'image/webp', 'webp');
  const value = await store.readBinary('profile', 'avatar');
  assert.deepEqual([...value.bytes], [1, 2, 3]);
  assert.equal(value.contentType, 'image/webp');
  assert.equal(value.extension, 'webp');
  assert.equal((await store.listPending()).length, 1);
  assert.equal(
    store.pathFor({ profileId: 'profile-1', appId: 'profile', saveKey: 'avatar', kind: 'binary', extension: 'webp' }),
    'profiles/profile-1/files/profile/avatar.webp'
  );
  assert.throws(() => store.pathFor({ profileId: 'profile-1', appId: '../x', saveKey: 'a', kind: 'json' }), /path/i);
});

test('marks records synced or conflicted without replacing local data', async () => {
  const { store } = await setup();
  await store.writeJson('wanko-war', 'progress', { cleared: ['S001'] });
  const identity = { profileId: 'profile-1', appId: 'wanko-war', saveKey: 'progress' };
  await store.markSynced(identity, 'sha-1');
  assert.equal((await store.listPending()).length, 0);
  assert.equal((await store.readRecord(identity)).remoteSha, 'sha-1');

  await store.markConflict(identity, 'sha-2');
  const record = await store.readRecord(identity);
  assert.equal(record.syncState, 'conflict');
  assert.deepEqual(await store.readJson('wanko-war', 'progress'), { cleared: ['S001'] });
});

test('creates and restores a validated local snapshot', async () => {
  const { store } = await setup();
  await store.writeJson('paint', 'canvas', { strokes: 1 });
  const snapshot = await store.createSnapshot({ profileId: 'profile-1', appId: 'paint', saveKey: 'canvas' });
  await store.writeJson('paint', 'canvas', { strokes: 9 });
  await store.restoreSnapshot({ profileId: 'profile-1', appId: 'paint', saveKey: 'canvas' }, snapshot.snapshotId);
  assert.deepEqual(await store.readJson('paint', 'canvas'), { strokes: 1 });
});

test('rejects malformed JSON and unsafe save segments', async () => {
  const { store } = await setup();
  await assert.rejects(() => store.writeJson('paint', 'canvas', undefined), /JSON/i);
  await assert.rejects(() => store.writeJson('../paint', 'canvas', {}), /path/i);
  await assert.rejects(() => store.writeBinary('paint', '../canvas', Uint8Array.from([1]), 'application/octet-stream'), /path/i);
});
