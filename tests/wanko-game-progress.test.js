const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('../shared/wanko-game-data.js');
const { createProgressStore, createProfileStore, mergeStates } = require('../shared/wanko-game-progress.js');

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
    selectedStageId: 'S001', discoveredElementIds: [], discoveredCharacterIds: [], clearedStageIds: [], selectedWanko: null, ownedWankoIds: [], economy: { pointEarned: {}, pointSpent: {}, ticketEarned: {}, ticketSpent: {} }
  });
  assert.equal(await store.isStageUnlocked('S001'), true);
  assert.equal(await store.isStageUnlocked('S002'), false);
  assert.equal(await store.isCharacterUnlocked('W01'), true);
  assert.equal(await store.isCharacterUnlocked('W02'), true);
  assert.equal(await store.isCharacterUnlocked('W03'), false);
});

test('profile-scoped progress writes only to the captured profile namespace', async () => {
  const writes = [];
  let stored = null;
  const saveStore = {
    get: async () => stored ? { value: stored } : null,
    put: async (...args) => { writes.push(args); stored = args[3]; }
  };
  const store = createProfileStore('child-a', saveStore, game);
  await store.startStage('S001');
  const lastWrite = writes.at(-1);
  assert.equal(lastWrite[0], 'child-a');
  assert.equal(lastWrite[1], 'wanko-war');
  assert.equal(lastWrite[2], 'progress');
  assert.deepEqual(lastWrite[3].discoveredElementIds, [1]);
});

test('starting an unlocked stage selects it and discovers its element', async () => {
  const storage = memoryStorage();
  const store = createProgressStore(storage, game);
  await store.startStage('S001');
  assert.deepEqual(await store.getState(), {
    selectedStageId: 'S001', discoveredElementIds: [1], discoveredCharacterIds: [], clearedStageIds: [], selectedWanko: null, ownedWankoIds: [], economy: { pointEarned: {}, pointSpent: {}, ticketEarned: {}, ticketSpent: {} }
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
    selectedStageId: 'S001', discoveredElementIds: [1, 79], discoveredCharacterIds: ['E01'], clearedStageIds: ['S001'], selectedWanko: null, ownedWankoIds: [], economy: { pointEarned: {}, pointSpent: {}, ticketEarned: {}, ticketSpent: {} }
  });
});


test('stores the selected official or custom wanko in profile progress', async () => {
  const store = createProgressStore(memoryStorage(), game);
  await store.setSelectedWanko({ source: 'official', id: 'futsuu-no-wanko' });
  assert.deepEqual((await store.getState()).selectedWanko, { source: 'official', id: 'futsuu-no-wanko' });
  await store.setSelectedWanko({ source: 'custom', id: 'drawing-1' });
  assert.deepEqual((await store.getState()).selectedWanko, { source: 'custom', id: 'drawing-1' });
});


test('persists gacha-owned custom wankos and merges ownership safely', async () => {
  const store = createProgressStore(memoryStorage(), game);
  await store.ownWanko('drawing-1');
  await store.ownWanko('drawing-1');
  await store.ownWanko('drawing-2');
  assert.deepEqual((await store.getState()).ownedWankoIds, ['drawing-1', 'drawing-2']);
  assert.equal(await store.isWankoOwned('drawing-1'), true);
  assert.equal(await store.isWankoOwned('missing'), false);
});


test('merges gacha ownership by union across devices', () => {
  const merged = mergeStates(
    { ownedWankoIds: ['drawing-a'] },
    { ownedWankoIds: ['drawing-b', 'drawing-a'] },
    game
  );
  assert.deepEqual(merged.ownedWankoIds, ['drawing-a', 'drawing-b']);
});


test('awards points and exchanges them for gacha tickets', async () => {
  const store = createProgressStore(memoryStorage(), game);
  await store.awardPoints(3, 'device-a');
  await store.awardPoints(10, 'device-a');
  assert.deepEqual(await store.getWallet(), { points: 13, tickets: 0 });
  await assert.rejects(store.exchangePointsForTicket(20, 'device-a'), /not enough points/i);
  await store.awardPoints(7, 'device-a');
  await store.exchangePointsForTicket(20, 'device-a');
  assert.deepEqual(await store.getWallet(), { points: 0, tickets: 1 });
  await store.spendGachaTicket('device-a');
  assert.deepEqual(await store.getWallet(), { points: 0, tickets: 0 });
  await assert.rejects(store.spendGachaTicket('device-a'), /no gacha ticket/i);
});

test('merges economy counters by device without losing concurrent gains', () => {
  const merged = mergeStates(
    { economy: { pointEarned: { 'device-a': 5 }, pointSpent: {}, ticketEarned: {}, ticketSpent: {} } },
    { economy: { pointEarned: { 'device-b': 7 }, pointSpent: {}, ticketEarned: {}, ticketSpent: {} } },
    game
  );
  assert.deepEqual(merged.economy.pointEarned, { 'device-a': 5, 'device-b': 7 });
});
