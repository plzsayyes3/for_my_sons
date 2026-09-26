const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('addition and subtraction save points on every scored correct answer', () => {
  for (const relative of [
    'wanko-mini/addition/index.html',
    'wanko-mini/subtraction/index.html'
  ]) {
    const html = read(relative);
    assert.match(html, /async function submitAnswer\(\)/);
    assert.match(html, /Progress\.awardPoints\(points,economyDeviceId\)/);
    assert.doesNotMatch(html, /Progress\.awardPoints\(totalScore,economyDeviceId\)/);
    assert.match(html, /BroadcastChannel\('wanko-progress'\)/);
    assert.match(html, /wanko-economy-updated/);
  }
});

test('multiplication broadcasts each saved point change', () => {
  const html = read('wanko-mini/multiplication/index.html');
  assert.match(html, /Progress\.awardPoints\(points,economyDeviceId\)/);
  assert.match(html, /BroadcastChannel\('wanko-progress'\)/);
  assert.match(html, /wanko-economy-updated/);
});

test('gacha refreshes wallet state on live updates and page restoration', () => {
  const html = read('wanko-gacha/index.html');
  assert.match(html, /async function refreshProgressState/);
  assert.match(html, /BroadcastChannel\('wanko-progress'\)/);
  assert.match(html, /wanko-economy-updated/);
  assert.match(html, /addEventListener\('pageshow'/);
  assert.match(html, /addEventListener\('focus'/);
  assert.match(html, /addEventListener\('visibilitychange'/);
  assert.match(html, /progressSync\.initialize\(\)/);
});
