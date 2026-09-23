const test = require('node:test');
const assert = require('node:assert/strict');
const { createProfileManager } = require('../shared/profile-manager.js');

function storage() {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('keeps the selected profile local and session identity immutable', async () => {
  const local = storage();
  const events = [];
  const manager = createProfileManager({ sync: { listProfiles: async () => [
    { profileId: 'child-a', label: 'Child A' }, { profileId: 'child-b', label: 'Child B' }
  ] }, localStorage: local, eventTarget: { dispatchEvent: event => events.push(event) } });
  await manager.switchProfile('child-a');
  const session = await manager.openSession();
  await manager.switchProfile('child-b');
  assert.equal(session.profileId, 'child-a');
  assert.equal((await manager.current()).profileId, 'child-b');
  assert.equal(events.length, 2);
});

test('does not accept a selected profile absent from the verified private list', async () => {
  const manager = createProfileManager({ sync: { listProfiles: async () => [] }, localStorage: storage() });
  await assert.rejects(manager.switchProfile('child-a'));
});
