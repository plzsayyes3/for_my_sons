const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('../shared/wanko-game-data.js');
const { createProgressStore } = require('../shared/wanko-game-progress.js');

function memoryStorage(initialValue = null) {
  let value = initialValue;
  let savedKey = null;
  return {
    getMeta: async () => value,
    setMeta: async (key, nextValue) => { savedKey = key; value = structuredClone(nextValue); },
    read: () => value,
    key: () => savedKey
  };
}

test('starts with only S001 playable and unlocked ally slots available', async () => {
  const store = createProgressStore(memoryStorage(), game);
  assert.deepEqual(await store.getState(), {
    selectedStageId: 'S001', discoveredElementIds: [], discoveredCharacterIds: [], clearedStageIds: []
  });
  assert.equal(await store.isStageUnlocked('S001'), true);
  assert.equal(await store.isStageUnlocked('S002'), false);
  assert.equal(await store.isCharacterUnlocked('W01'), true);
  assert.equal(await store.isCharacterUnlocked('W02'), true);
  assert.equal(await store.isCharacterUnlocked('W03'), false);
});

test('starting an unlocked stage selects it and discovers its element', async () => {
  const storage = memoryStorage();
  const store = createProgressStore(storage, game);
  await store.startStage('S001');
  assert.deepEqual(await store.getState(), {
    selectedStageId: 'S001', discoveredElementIds: [1], discoveredCharacterIds: [], clearedStageIds: []
  });
  assert.equal(storage.key(), 'wankoGameProgressV1');
});

test('a locked stage cannot be selected or started', async () => {
  const store = createProgressStore(memoryStorage(), game);
  await assert.rejects(store.selectStage('S002'), /locked/i);
  await assert.rejects(store.startStage('S002'), /locked/i);
  await assert.rejects(store.startStage('missing'), /unknown/i);
  assert.deepEqual((await store.getState()).discoveredElementIds, []);
});

test('records discovered enemy and boss IDs without accepting ally IDs', async () => {
  const storage = memoryStorage();
  const store = createProgressStore(storage, game);
  await store.discoverCharacter('E01');
  await store.discoverCharacter('B01');
  await store.discoverCharacter('E01');
  assert.deepEqual((await store.getState()).discoveredCharacterIds, ['B01', 'E01']);
  await assert.rejects(store.discoverCharacter('W01'), /not an enemy/i);
  await assert.rejects(store.discoverCharacter('missing'), /unknown/i);
});

test('winning unlocks the next stage and its milestone ally without duplicate records', async () => {
  const store = createProgressStore(memoryStorage(), game);
  for (let number = 1; number <= 10; number++) {
    const stageId = `S${String(number).padStart(3, '0')}`;
    await store.startStage(stageId);
    await store.completeStage(stageId);
  }
  await store.completeStage('S010');
  assert.equal(await store.isStageUnlocked('S011'), true);
  assert.equal(await store.isCharacterUnlocked('W03'), true);
  assert.deepEqual((await store.getState()).clearedStageIds, Array.from(
    { length: 10 }, (_, index) => `S${String(index + 1).padStart(3, '0')}`
  ));
});

test('loss and replay preserve existing clears and discoveries', async () => {
  const store = createProgressStore(memoryStorage(), game);
  await store.startStage('S001');
  await store.completeStage('S001');
  const before = await store.getState();
  await store.startStage('S001');
  assert.deepEqual((await store.getState()).clearedStageIds, before.clearedStageIds);
  assert.deepEqual((await store.getState()).discoveredElementIds, before.discoveredElementIds);
});

test('repairs malformed saved progress without losing valid IDs', async () => {
  const storage = memoryStorage({
    selectedStageId: 'not-a-stage',
    discoveredElementIds: [1, 1, 'bad', 79],
    discoveredCharacterIds: ['E01', 'W01', 'E01', 'bad'],
    clearedStageIds: ['S001', 'S999', 'S001']
  });
  const store = createProgressStore(storage, game);
  assert.deepEqual(await store.getState(), {
    selectedStageId: 'S001', discoveredElementIds: [1, 79], discoveredCharacterIds: ['E01'], clearedStageIds: ['S001']
  });
});
