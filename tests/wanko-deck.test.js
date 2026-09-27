const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const game = require('../shared/wanko-game-data.js');
const progress = require('../shared/wanko-game-progress.js');

test('deck keeps at most eight unique valid slot keys', () => {
  const state = progress.normalizeState({
    deckSlots: ['game:W01','game:W02','game:W03','game:W04','game:W05','game:W06','game:W07','game:W08','game:W09','game:W01','bad'],
    deckUpdatedAt: 123
  }, game);
  assert.deepEqual(state.deckSlots, ['game:W01','game:W02','game:W03','game:W04','game:W05','game:W06','game:W07','game:W08']);
  assert.equal(state.deckUpdatedAt, 123);
});

test('newer deck edit wins profile merge without affecting economy', () => {
  const merged = progress.mergeStates(
    { deckSlots:['game:W01'], deckUpdatedAt:100, economy:{pointEarned:{a:4}} },
    { deckSlots:['game:W02','custom:abc'], deckUpdatedAt:200, economy:{pointEarned:{b:7}} },
    game
  );
  assert.deepEqual(merged.deckSlots, ['game:W02','custom:abc']);
  assert.equal(progress.walletFromState(merged).points, 11);
});

test('deck editor and battle are wired to the saved deck', () => {
  const editor = fs.readFileSync(path.join(__dirname,'../wanko-deck/index.html'),'utf8');
  const battle = fs.readFileSync(path.join(__dirname,'../wanko-war/index.html'),'utf8');
  assert.match(editor, /setDeckSlots\(deck\)/);
  assert.match(editor, /deck\.length<8/);
  assert.match(battle, /function effectiveDeck/);
  assert.match(battle, /deckKeys\.has\('game:'\+id\)/);
  assert.match(battle, /deckKeys\.has\('custom:'\+wanko\.id\)/);
});
