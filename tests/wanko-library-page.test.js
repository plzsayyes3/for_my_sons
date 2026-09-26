const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

test('library keeps top-level tabs and adds custom and owned tabs under allies', () => {
  const source = read('wanko-library/index.html');
  assert.match(source, /data-tab="allies"/);
  assert.match(source, /data-tab="enemies"/);
  assert.match(source, /data-tab="elements"/);
  assert.match(source, /data-subtab="custom"/);
  assert.match(source, /data-subtab="owned"/);
  assert.match(source, /自作/);
  assert.match(source, /所持/);
});

test('library custom cards expose archive confirmation while owned cards stay non-deletable', () => {
  const source = read('wanko-library/index.html');
  assert.match(source, /archiveWanko/);
  assert.match(source, /このわんこを削除する？/);
  assert.match(source, /削除すると、この端末の図鑑から見えなくなります。/);
  assert.match(source, /buildCustomCards/);
  assert.match(source, /buildOwnedCards/);
  assert.match(source, /onDelete/);
});

test('library reads character request state without implementing a GitHub Contents API', () => {
  const source = read('wanko-library/index.html');
  assert.match(source, /characterRequestId/);
  assert.doesNotMatch(source, /api\.github\.com/);
  assert.doesNotMatch(source, /Authorization\s*:/);
});
