const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

test('Paint contains faction choices and the implementation request action', () => {
  const html = read('paint/index.html');
  assert.match(html, /味方/);
  assert.match(html, /敵/);
  assert.match(html, /登録依頼を出す/);
  assert.match(html, /どっちのわんこ/);
});

test('Paint source uses the shared request facade and does not build official stats', () => {
  const source = read('paint/app.js');
  assert.match(source, /characterRequests/);
  assert.match(source, /登録依頼を送信しました/);
  assert.doesNotMatch(source, /official-wankos/);
  assert.doesNotMatch(source, /cost:\s*180/);
  assert.doesNotMatch(source, /WankoLibrary\.registerWanko/);
  assert.match(source, /認証が必要です/);
  assert.match(source, /競合しています/);
});
