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

test('deck editor falls back to profile-local official Wankos when optional loading fails', () => {
  const editor = fs.readFileSync(path.join(__dirname,'../wanko-deck/index.html'),'utf8');
  assert.match(editor, /state=await scoped\.getState\(\)/);
  assert.match(editor, /Custom Wanko list failed; continuing with official Wankos/);
  assert.match(editor, /let customList=\[\]/);
  assert.match(editor, /state\?\.ownedWankoIds/);
  assert.match(editor, /id="count">読込中</);
});

test('Wanko entry points use deck v4', () => {
  const home = fs.readFileSync(path.join(__dirname,'../wanko/index.html'),'utf8');
  const battle = fs.readFileSync(path.join(__dirname,'../wanko-war/index.html'),'utf8');
  assert.match(home, /wanko-deck\/\?v=4/);
  assert.match(battle, /wanko-deck\/\?v=4/);
});

test('deck loads the complete current shared API dependency chain', () => {
  const editor = fs.readFileSync(path.join(__dirname,'../wanko-deck/index.html'),'utf8');
  const db = editor.indexOf('../shared/for-my-sons-db.js?v=4');
  const github = editor.indexOf('../shared/github-sync.js?v=9');
  const requests = editor.indexOf('../shared/character-requests.js?v=3');
  const parentRequests = editor.indexOf('../shared/parent-requests.js?v=3');
  const facade = editor.indexOf('../shared/for-my-sons.js?v=12');
  assert.ok(db >= 0 && github > db && requests > github && parentRequests > requests && facade > parentRequests);
});

test('shared IndexedDB cannot leave the Wanko deck waiting forever on a blocked upgrade', () => {
  const db = fs.readFileSync(path.join(__dirname,'../shared/for-my-sons-db.js'),'utf8');
  const editor = fs.readFileSync(path.join(__dirname,'../wanko-deck/index.html'),'utf8');
  assert.match(db, /request\.onblocked/);
  assert.match(db, /DB_BLOCKED/);
  assert.match(db, /database\.onversionchange = \(\) => database\.close\(\)/);
  assert.match(editor, /Legacy Wanko state timed out/);
  assert.match(editor, /basicわんこ|基本わんこ/);
});
