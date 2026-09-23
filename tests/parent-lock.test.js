const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const { createParentLock } = require('../shared/parent-lock.js');

function fixture() {
  const data = new Map();
  const storage = { get: async key => data.get(key), set: async (key, value) => data.set(key, value), delete: async key => data.delete(key) };
  return { lock: createParentLock(storage, webcrypto), data };
}

test('requires a six-digit PIN to unlock settings and persists the token only in local settings storage', async () => {
  const { lock, data } = fixture();
  assert.equal(await lock.isConfigured(), false);
  await assert.rejects(lock.setupPin('4826'), /six digits/i);
  await lock.setupPin('048261');
  assert.equal(await lock.isConfigured(), true);
  await lock.storeToken('ghp-example-secret');
  assert.equal(data.get('parentLock').token, 'ghp-example-secret');
  assert.equal(await lock.withToken(token => token), 'ghp-example-secret');
  lock.lock();
  await assert.rejects(lock.withToken(token => token), /locked/i);
  await lock.unlock('048261');
  assert.equal(await lock.withToken(token => token), 'ghp-example-secret');
});

test('rejects a wrong PIN and limits repeated guesses temporarily', async () => {
  const { lock } = fixture();
  await lock.setupPin('482610');
  for (let attempt = 0; attempt < 5; attempt++) await assert.rejects(lock.unlock('000000'));
  await assert.rejects(lock.unlock('482610'), /temporarily locked/i);
});

test('does not require a dedicated origin because PIN is a child-facing UI lock', async () => {
  const { lock } = fixture();
  await lock.setupPin('482610');
  await lock.storeToken('local-only-token');
  assert.equal(await lock.withToken(token => token), 'local-only-token');
});
