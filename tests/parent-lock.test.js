const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const { createParentLock } = require('../shared/parent-lock.js');

function fixture(origin = 'https://family.example') {
  const data = new Map();
  const storage = { get: async key => data.get(key), set: async (key, value) => data.set(key, value), delete: async key => data.delete(key) };
  return { lock: createParentLock(storage, webcrypto, origin, () => 'https://family.example'), data };
}

test('encrypts token at rest and returns it only inside an unlocked callback', async () => {
  const { lock, data } = fixture();
  await lock.setupPin('4826');
  await lock.storeToken('ghp-example-secret');
  const envelope = data.get('parentLock');
  assert.ok(envelope.token.ciphertext);
  assert.equal(JSON.stringify(envelope).includes('ghp-example-secret'), false);
  assert.equal(await lock.withToken(token => token), 'ghp-example-secret');
  lock.lock();
  await assert.rejects(lock.withToken(token => token), /locked/i);
});

test('rejects a wrong PIN and damaged ciphertext', async () => {
  const { lock, data } = fixture();
  await lock.setupPin('4826');
  await assert.rejects(lock.unlock('0000'));
  await lock.storeToken('token');
  lock.lock();
  const envelope = data.get('parentLock');
  const damaged = Buffer.from(envelope.token.ciphertext, 'base64');
  damaged[damaged.length - 1] ^= 0xff;
  envelope.token.ciphertext = damaged.toString('base64');
  await lock.unlock('4826');
  await assert.rejects(lock.withToken(token => token));
});

test('fails closed for unset, github.io, or mismatched origins', async () => {
  for (const [allowed, current] of [
    ['', 'https://family.example'],
    ['https://family.github.io', 'https://family.github.io'],
    ['https://family.example', 'https://other.example']
  ]) {
    const data = new Map();
    const lock = createParentLock({ get: async k => data.get(k), set: async (k, v) => data.set(k, v) }, webcrypto, allowed, () => current);
    await lock.setupPin('4826');
    await assert.rejects(lock.storeToken('token'), /origin/i);
  }
});
