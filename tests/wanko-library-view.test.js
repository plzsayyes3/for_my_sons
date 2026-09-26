const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('../shared/wanko-game-data.js');
const view = require('../shared/wanko-library-view.js');

test('custom cards contain only local wankos and expose request and active state', () => {
  const cards = view.buildCustomCards([
    { id: 'custom-1', name: '依頼済み', createdAt: '2026-09-25T00:00:00.000Z', characterRequestId: 'request-1', blob: {} },
    { id: 'custom-2', name: '旧わんこ', createdAt: '2026-09-24T00:00:00.000Z', blob: {} }
  ], { activeId: 'custom-1', requestIds: new Set(['request-1']) });

  assert.deepEqual(cards.map(card => card.id), ['custom-1', 'custom-2']);
  assert.equal(cards[0].source, 'custom');
  assert.equal(cards[0].deletable, true);
  assert.equal(cards[0].active, true);
  assert.equal(cards[0].requestSubmitted, true);
  assert.equal(cards[1].requestSubmitted, false);
});

test('owned cards combine official and unlocked game cards without deletion', () => {
  const cards = view.buildOwnedCards({
    officials: [{ id: 'official-1', name: '正式わんこ', image: 'official.webp' }],
    gameCards: [
      { id: 'W01', name: '解放済み', unlocked: true, artwork: null, placeholder: '🐕' },
      { id: 'W03', name: '未所持', unlocked: false, artwork: null, placeholder: '🐢' }
    ]
  });

  assert.deepEqual(cards.map(card => card.id), ['official-1', 'W01']);
  assert.deepEqual(cards.map(card => card.source), ['official', 'game']);
  assert.equal(cards.every(card => card.deletable === false), true);
});

test('ally cards distinguish placeholder art and unlock milestone characters from clears', () => {
  const progress = { discoveredElementIds: [], clearedStageIds: [] };
  const cards = view.buildAllyCards(game.characters, progress);
  assert.equal(cards.length, 8);
  assert.equal(cards.find(card => card.id === 'W01').characterStatus, 'placeholder');
  assert.equal(cards.find(card => card.id === 'W01').unlocked, true);
  assert.equal(cards.find(card => card.id === 'W03').unlocked, false);
  assert.equal(cards.find(card => card.id === 'W03').unlockAfterStage, 'S010');

  const unlocked = view.buildAllyCards(game.characters, { ...progress, clearedStageIds: ['S010'] });
  assert.equal(unlocked.find(card => card.id === 'W03').unlocked, true);
});

test('enemy cards hide unrevealed identity and show discovered E and B slots', () => {
  const hidden = view.buildEnemyCards(game.characters, { discoveredElementIds: [], clearedStageIds: [] });
  assert.equal(hidden[0].id, 'E01');
  assert.equal(hidden.at(-1).id, 'B08');
  const e01 = hidden.find(card => card.id === 'E01');
  const b01 = hidden.find(card => card.id === 'B01');
  assert.equal(e01.discovered, false);
  assert.equal(e01.name, 'まだひみつ');
  assert.equal(e01.placeholder, '❔');
  assert.equal(b01.discovered, false);

  const discovered = view.buildEnemyCards(game.characters, { discoveredElementIds: [1], discoveredCharacterIds: ['E01','B01'], clearedStageIds: [] });
  assert.equal(discovered.find(card => card.id === 'E01').name, 'ぷるぷる');
  assert.equal(discovered.find(card => card.id === 'B01').discovered, true);
});

test('element cards follow stage order and distinguish undiscovered, found, and cleared states', () => {
  const progress = { discoveredElementIds: [1], clearedStageIds: ['S001'] };
  const cards = view.buildElementCards(game.stages, game.elements, progress);
  assert.equal(cards.length, 118);
  assert.deepEqual(
    cards.slice(0, 2).map(card => [card.stageId, card.symbol, card.name]),
    [['S001','H','水素'],['S002',null,'???']]
  );
  assert.equal(cards[0].cleared, true);
  assert.equal(cards[1].discovered, false);
  assert.equal(cards[1].symbol, null);
  assert.equal(cards[1].name, '???');
  assert.deepEqual(
    [cards.at(-1).stageId, cards.at(-1).symbol, cards.at(-1).name, cards.at(-1).atomicNumber],
    ['S118',null,'???',null]
  );
});
