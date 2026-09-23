const test = require('node:test');
const assert = require('node:assert/strict');
const { createAutoSync } = require('../shared/auto-sync.js');

class FakeTarget {
  listeners = new Map();
  addEventListener(name, callback) { this.listeners.set(name, callback); }
  removeEventListener(name) { this.listeners.delete(name); }
  emit(name, event = {}) { this.listeners.get(name)?.(event); }
}

class FakeChannel {
  static instance;
  constructor() { this.onmessage = null; FakeChannel.instance = this; }
  close() {}
  send(data) { this.onmessage?.({ data }); }
}

const tick = () => new Promise(resolve => setImmediate(resolve));

test('syncs the current profile on online and save-pending events while parent is unlocked', async () => {
  const target = new FakeTarget();
  const synced = [];
  let unlocked = true;
  const auto = createAutoSync({
    sync: { syncProfile: async profileId => { synced.push(profileId); return [{ status: 'synced' }]; } },
    profile: { current: async () => ({ profileId: 'child-a' }) },
    isUnlocked: () => unlocked,
    target,
    channelFactory: () => new FakeChannel()
  });
  target.emit('online');
  await tick();
  FakeChannel.instance.send({ type: 'save-pending', profileId: 'child-a' });
  await tick();
  assert.equal(synced.length, 2);
  assert.equal(synced[0], 'child-a');
  auto.dispose();
});

test('does not sync while locked, offline, or for a different profile', async () => {
  const target = new FakeTarget();
  let calls = 0;
  let online = true;
  let unlocked = false;
  const auto = createAutoSync({
    sync: { syncProfile: async () => { calls++; return []; } },
    profile: { current: async () => ({ profileId: 'child-a' }) },
    isUnlocked: () => unlocked,
    target,
    isOnline: () => online,
    channelFactory: () => new FakeChannel()
  });
  await auto.trigger();
  FakeChannel.instance.send({ type: 'save-pending', profileId: 'child-b' });
  unlocked = true;
  online = false;
  await auto.trigger();
  assert.equal(calls, 0);
  auto.dispose();
});

test('backs off after a failed sync to avoid hammering the private API', async () => {
  const target = new FakeTarget();
  let calls = 0;
  const auto = createAutoSync({
    sync: { syncProfile: async () => { calls++; throw new Error('offline'); } },
    profile: { current: async () => ({ profileId: 'child-a' }) },
    isUnlocked: () => true,
    target,
    channelFactory: () => new FakeChannel(),
    retryDelayMs: 10000
  });
  await auto.trigger();
  await auto.trigger();
  assert.equal(calls, 1);
  auto.dispose();
});
