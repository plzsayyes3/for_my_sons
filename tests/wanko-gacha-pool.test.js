const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('Wanko gacha always builds candidates from the game ally roster', () => {
  const source = fs.readFileSync(path.join(root, 'wanko-gacha', 'index.html'), 'utf8');
  assert.match(source, /getSelectableAllyIds/);
  assert.match(source, /const id='game:'\+gameId/);
  assert.match(source, /characters=\[\.\.\.gameCharacters,\.\.\.customCharacters\]/);
  assert.match(source, /ガチャのなかま候補/);
});

test('gacha-owned game allies can enter the deck before stage unlock', () => {
  const editor = fs.readFileSync(path.join(root, 'wanko-deck', 'index.html'), 'utf8');
  const battle = fs.readFileSync(path.join(root, 'wanko-war', 'index.html'), 'utf8');
  assert.match(editor, /owned\.has\('game:'\+id\)/);
  assert.match(editor, /stageUnlocked\|\|gachaOwned/);
  assert.match(battle, /owned\.has\('game:'\+id\)/);
});

test('duplicate game ally draws reuse the existing star and refund path', () => {
  const source = fs.readFileSync(path.join(root, 'wanko-gacha', 'index.html'), 'utf8');
  assert.match(source, /recordDuplicateWankoDraw\(character\.id,economyDeviceId,10\)/);
  assert.match(source, /starsFromState\(progressState,id\)/);
});


test('gacha supports a ten-pull with one atomic ten-ticket spend', () => {
  const source = fs.readFileSync(path.join(root, 'wanko-gacha', 'index.html'), 'utf8');
  assert.match(source, /id="tenDraw"/);
  assert.match(source, /10枚で 10連ひく/);
  assert.match(source, /Progress\.spendGachaTickets\(10,economyDeviceId\)/);
  assert.match(source, /for\(let i=0;i<10;i\+\+\)/);
  assert.match(source, /multiResultGrid/);
});

test('gacha uses Web Audio feedback for taps, reveals, exchange, and ten-pull fanfare', () => {
  const source = fs.readFileSync(path.join(root, 'wanko-gacha', 'index.html'), 'utf8');
  assert.match(source, /window\.AudioContext\|\|window\.webkitAudioContext/);
  assert.match(source, /playSound\('tap'\)/);
  assert.match(source, /playSound\(wasOwned\?'duplicate':'new'\)/);
  assert.match(source, /playSound\('exchange'\)/);
  assert.match(source, /playSound\('ten'\)/);
});


test('gacha inline script remains valid JavaScript', () => {
  const source = fs.readFileSync(path.join(root, 'wanko-gacha', 'index.html'), 'utf8');
  const match = source.match(/<script>\s*([\s\S]*?)<\/script>/);
  assert.ok(match);
  assert.doesNotThrow(() => new Function(match[1]));
});
