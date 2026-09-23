const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DB_NAME,
  DB_VERSION,
  STORE_NAMES,
  createMemoryDatabase
} = require('../shared/for-my-sons-db.js');

test('shared database declares the versioned stores', () => {
  assert.equal(DB_NAME, 'for-my-sons-shared-v1');
  assert.equal(DB_VERSION, 1);
  assert.deepEqual(STORE_NAMES, ['settings', 'profiles', 'avatars', 'saves', 'snapshots']);
});

test('memory database preserves records and binary values', async () => {
  const db = createMemoryDatabase();
  const records = [
    ['settings', { key: 'currentProfile', value: 'profile-1' }, 'currentProfile'],
    ['profiles', { id: 'profile-1', label: 'profile-1' }, 'profile-1'],
    ['avatars', { id: 'profile-1', blob: Uint8Array.from([4, 5]) }, 'profile-1'],
    ['saves', { key: ['profile-1', 'paint', 'canvas'], value: Uint8Array.from([1, 2, 3]) }, ['profile-1', 'paint', 'canvas']],
    ['snapshots', { key: ['profile-1', 'paint', 'canvas', 'snapshot-1'], value: { strokes: 2 } }, ['profile-1', 'paint', 'canvas', 'snapshot-1']]
  ];

  for (const [store, value, key] of records) await db.put(store, value, key);

  assert.equal((await db.get('settings', 'currentProfile')).value, 'profile-1');
  assert.equal((await db.get('profiles', 'profile-1')).label, 'profile-1');
  assert.deepEqual([...((await db.get('avatars', 'profile-1')).blob)], [4, 5]);
  assert.deepEqual([...((await db.get('saves', ['profile-1', 'paint', 'canvas'])).value)], [1, 2, 3]);
  assert.deepEqual((await db.get('snapshots', ['profile-1', 'paint', 'canvas', 'snapshot-1'])).value, { strokes: 2 });
  assert.equal((await db.list('profiles')).length, 1);

  await db.delete('profiles', 'profile-1');
  assert.equal(await db.get('profiles', 'profile-1'), null);
});
