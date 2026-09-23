const test = require('node:test');
const assert = require('node:assert/strict');
const { createMemoryDatabase } = require('../shared/for-my-sons-db.js');
const { PROFILE_ID_PATTERN, createProfileManager } = require('../shared/profile-manager.js');

test('accepts only generic profile IDs', () => {
  assert.ok(PROFILE_ID_PATTERN.test('profile-1'));
  assert.ok(PROFILE_ID_PATTERN.test('profile-2'));
  assert.equal(PROFILE_ID_PATTERN.test('../profile-2'), false);
  assert.equal(PROFILE_ID_PATTERN.test('Profile-1'), false);
  assert.equal(PROFILE_ID_PATTERN.test('profile 1'), false);
});

test('creates a safe default current profile and switches profiles', async () => {
  const manager = createProfileManager(createMemoryDatabase());
  const initial = await manager.current();
  assert.deepEqual(initial, { id: 'profile-1', label: 'profile-1', createdAt: initial.createdAt, updatedAt: initial.updatedAt });

  const selected = await manager.setCurrent('profile-2');
  assert.equal(selected.id, 'profile-2');
  assert.equal((await manager.current()).id, 'profile-2');
  assert.deepEqual((await manager.list()).map(profile => profile.id), ['profile-1', 'profile-2']);
});

test('rejects unsafe profile IDs before persistence', async () => {
  const manager = createProfileManager(createMemoryDatabase());
  await manager.current();
  await assert.rejects(() => manager.setCurrent('../profile-2'), /profile ID/i);
  assert.deepEqual((await manager.list()).map(profile => profile.id), ['profile-1']);
});

test('stores avatar bytes separately and emits profile changes', async () => {
  const manager = createProfileManager(createMemoryDatabase());
  await manager.current();
  const events = [];
  const unsubscribe = manager.onChange(event => events.push(event));
  const blob = Uint8Array.from([9, 8, 7]);

  await manager.setAvatar('profile-1', blob, 'image/webp');
  const avatar = await manager.getAvatar('profile-1');
  assert.deepEqual([...avatar.blob], [9, 8, 7]);
  assert.equal(avatar.contentType, 'image/webp');
  assert.equal(events.at(-1).type, 'avatar');

  unsubscribe();
  await manager.setCurrent('profile-2');
  assert.equal(events.some(event => event.type === 'currentProfile'), false);
});
