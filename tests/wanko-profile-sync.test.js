const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('../shared/wanko-game-data.js');
const { createProgressStore } = require('../shared/wanko-game-progress.js');
const { createWankoProfileSync } = require('../shared/wanko-profile-sync.js');

function memoryProgress(initial = null) {
  let value = initial;
  return createProgressStore({
    getMeta: async () => value,
    setMeta: async (_key, next) => { value = structuredClone(next); }
  }, game);
}

test('merges local and remote progress without losing clears or discoveries', async () => {
  const progressStore = memoryProgress({
    selectedStageId: 'S002',
    discoveredElementIds: [1, 2],
    discoveredCharacterIds: ['E01'],
    clearedStageIds: ['S001']
  });
  let localRecord = {
    value: {
      selectedStageId: 'S002',
      discoveredElementIds: [1, 2],
      discoveredCharacterIds: ['E01'],
      clearedStageIds: ['S001']
    }
  };
  let remoteData = {
    dataVersion: 1,
    progress: {
      selectedStageId: 'S003',
      discoveredElementIds: [1, 3],
      discoveredCharacterIds: ['E02'],
      clearedStageIds: ['S001', 'S002']
    }
  };
  const writes = [];
  const api = {
    save: {
      get: async () => localRecord
    },
    sync: {
      readProfileApp: async () => ({ exists: true, data: remoteData, sha: 'sha-1', revision: 2 }),
      writeProfileApp: async (_profileId, _appId, data) => {
        writes.push(data);
        remoteData = { ...remoteData, ...data };
        return { status: 'synced', sha: 'sha-2' };
      }
    }
  };
  const sync = createWankoProfileSync({ api, profileId: 'child-a', definitions: game, progressStore, debounceMs: 0 });
  const result = await sync.initialize();
  assert.deepEqual(result.state.clearedStageIds, ['S001', 'S002']);
  assert.deepEqual(result.state.discoveredElementIds, [1, 2, 3]);
  assert.deepEqual(result.state.discoveredCharacterIds, ['E01', 'E02']);
  assert.equal(result.state.selectedStageId, 'S003');
  assert.equal(writes.length, 1);
});

test('keeps local progress playable when remote sync is unavailable', async () => {
  const progressStore = memoryProgress();
  const api = {
    save: { get: async () => null },
    sync: {
      readProfileApp: async () => { throw new Error('offline'); },
      writeProfileApp: async () => { throw new Error('offline'); }
    }
  };
  const sync = createWankoProfileSync({ api, profileId: 'child-a', definitions: game, progressStore });
  const result = await sync.initialize();
  assert.equal(result.remoteAvailable, false);
  assert.equal(result.state.selectedStageId, 'S001');
});
