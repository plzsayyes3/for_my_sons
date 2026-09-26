const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const { createMemoryDatabase } = require('../shared/for-my-sons-db.js');
const { createForMySons } = require('../shared/for-my-sons.js');

test('facade routes profile-scoped saves and redacts event payloads', async () => {
  const events = [];
  const api = await createForMySons({
    db: createMemoryDatabase(),
    crypto: webcrypto,
    eventTarget: { dispatchEvent: event => events.push(event) },
    fetch: async () => { throw new Error('offline'); },
    config: { owner: 'plzsayyes3', repo: 'For-My-Sons-save', branch: 'main' }
  });

  assert.equal((await api.profile.current()).id, 'profile-1');
  await api.save.json('paint', 'progress', { score: 3 });
  assert.deepEqual(await api.save.readJson('paint', 'progress'), { score: 3 });
  assert.equal(events.at(-1).type, 'for-my-sons-save-changed');
  assert.equal('value' in events.at(-1).detail, false);

  await api.profile.setCurrent('profile-2');
  assert.equal(await api.save.readJson('paint', 'progress'), null);
});

test('facade keeps model JSON separate from STL and thumbnail files', async () => {
  const api = await createForMySons({ db: createMemoryDatabase(), crypto: webcrypto });
  await api.save.json('kids-3d', 'model-project', { objects: [{ type: 'cube', scale: [1, 2, 3] }] });
  await api.save.binary('kids-3d', 'model-project-stl', Uint8Array.from([1, 2]), 'model/stl', 'stl');
  await api.save.binary('kids-3d', 'model-project-thumbnail', Uint8Array.from([3, 4]), 'image/webp', 'webp');
  assert.deepEqual((await api.save.readJson('kids-3d', 'model-project')).objects[0].scale, [1, 2, 3]);
  assert.deepEqual([...((await api.save.readBinary('kids-3d', 'model-project-stl')).bytes)], [1, 2]);
  assert.equal((await api.sync.status()).pending >= 3, true);
});

test('profile avatar becomes a pending shared save for repository backup', async () => {
  const api = await createForMySons({ db: createMemoryDatabase(), crypto: webcrypto });
  await api.profile.setAvatar('profile-1', Uint8Array.from([8, 9]), 'image/webp');
  const pending = await api.save.pending();
  assert.equal(pending.some(record => record.appId === 'profile' && record.saveKey === 'avatar'), true);
});

test('facade does not expose PAT in configuration or status events', async () => {
  const events = [];
  const api = await createForMySons({
    db: createMemoryDatabase(),
    eventTarget: { dispatchEvent: event => events.push(event) },
    crypto: webcrypto
  });
  const result = await api.sync.configure({ owner: 'plzsayyes3', repo: 'For-My-Sons-save', branch: 'main', token: 'secret-pat' });
  assert.deepEqual(result, { owner: 'plzsayyes3', repo: 'For-My-Sons-save', branch: 'main' });
  assert.equal(JSON.stringify(result).includes('secret-pat'), false);
  assert.equal(events.every(event => !JSON.stringify(event.detail).includes('secret-pat')), true);
});

test('character requests stay outside the selected sora save profile', async () => {
  const db = createMemoryDatabase();
  const api = await createForMySons({ db, crypto: webcrypto });
  await api.profile.setCurrent('profile-sora');
  const request = await api.characterRequests.create({
    requestId: 'request-sora-separation',
    name: 'そらの依頼',
    faction: 'ally',
    artwork: Uint8Array.from([1, 2, 3])
  });

  assert.equal(request.source, 'paint');
  assert.equal('profileId' in request, false);
  assert.equal(await api.save.readJson('paint', 'character-request'), null);
  assert.equal((await db.list('characterRequests')).length, 1);
  assert.equal((await db.list('saves')).length, 0);
});
