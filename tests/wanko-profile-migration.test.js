const test = require('node:test');
const assert = require('node:assert/strict');
const { copyLegacyWankoProgress } = require('../shared/wanko-profile-migration.js');

function fixture() {
  const old = { selectedStageId: 'S004', discoveredElementIds: [1, 2, 3], discoveredCharacterIds: ['E01'], clearedStageIds: ['S001', 'S002'] };
  const records = new Map();
  const legacyStorage = { getMeta: async key => key === 'wankoGameProgressV1' ? old : null };
  const saveStore = {
    get: async (...key) => records.get(JSON.stringify(key)) || null,
    put: async (...args) => { const value = args.pop(); records.set(JSON.stringify(args), { value }); return value; }
  };
  return { old, records, legacyStorage, saveStore };
}

test('copies legacy progress only after explicit parent confirmation and retains the source', async () => {
  const f = fixture();
  const result = await copyLegacyWankoProgress({ ...f, profileId: 'child-a', confirm: async preview => preview.clearedStageCount === 2 });
  assert.equal(result.status, 'copied');
  assert.deepEqual(f.records.get(JSON.stringify(['child-a', 'wanko-war', 'progress'])).value, f.old);
  assert.deepEqual(await f.legacyStorage.getMeta('wankoGameProgressV1'), f.old);
});

test('refuses absent confirmation, absent source, invalid destination, and duplicate overwrite', async () => {
  const f = fixture();
  assert.equal((await copyLegacyWankoProgress({ ...f, profileId: 'child-a', confirm: async () => false })).status, 'cancelled');
  assert.equal((await copyLegacyWankoProgress({ ...f, profileId: '../bad', confirm: async () => true })).status, 'invalid-profile');
  assert.equal((await copyLegacyWankoProgress({ ...f, profileId: 'child-a', confirm: async () => true })).status, 'copied');
  assert.equal((await copyLegacyWankoProgress({ ...f, profileId: 'child-a', confirm: async () => true })).status, 'already-exists');
});
