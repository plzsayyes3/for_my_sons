const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const { createMemoryDatabase } = require('../shared/for-my-sons-db.js');
const { createParentLock } = require('../shared/parent-lock.js');

test('starts without a PIN and rejects invalid PIN formats', async () => {
  const lock = createParentLock(createMemoryDatabase(), webcrypto);
  assert.equal(await lock.hasPin(), false);
  await assert.rejects(() => lock.setPin('123'), /PIN/i);
  await assert.rejects(() => lock.setPin('1234567890123'), /PIN/i);
  await assert.rejects(() => lock.setPin('12ab'), /PIN/i);
});

test('stores only a salted hash and verifies the parent PIN', async () => {
  const db = createMemoryDatabase();
  const lock = createParentLock(db, webcrypto);
  await lock.setPin('1234');
  assert.equal(await lock.hasPin(), true);
  assert.equal(await lock.verify('0000'), false);
  assert.equal(lock.isUnlocked(), false);
  assert.equal(await lock.verify('1234'), true);
  assert.equal(lock.isUnlocked(), true);

  const record = await lock.exportRecordForTest();
  assert.equal(record.pin, undefined);
  assert.equal(record.hash.length > 0, true);
  assert.equal(record.salt.length > 0, true);
});

test('changing the PIN rotates the salt and lock clears unlock state', async () => {
  const db = createMemoryDatabase();
  const lock = createParentLock(db, webcrypto);
  await lock.setPin('1234');
  const before = await lock.exportRecordForTest();
  assert.equal(await lock.verify('1234'), true);
  await lock.setPin('5678');
  const after = await lock.exportRecordForTest();
  assert.notEqual(after.salt, before.salt);
  assert.equal(await lock.verify('1234'), false);
  assert.equal(await lock.verify('5678'), true);
  lock.lock();
  assert.equal(lock.isUnlocked(), false);
});
