const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('service worker precaches request assets under a new cache version', () => {
  const source = fs.readFileSync('service-worker.js', 'utf8');
  assert.match(source, /const CACHE_NAME = 'for-my-sons-v\\d+';/);
  assert.match(source, /\.\/shared\/character-requests\.js\?v=5/);
  assert.match(source, /\.\/shared\/parent-requests\.js\?v=4/);
  assert.match(source, /\.\/shared\/parent-request-view\.js\?v=4/);
  assert.match(source, /\.\/shared\/parent-history-view\.js\?v=3/);
  assert.match(source, /\.\/app\.js\?v=5/);
  assert.match(source, /\.\/styles\.css\?v=4/);
  assert.match(source, /\.\/shared\/for-my-sons\.js\?v=13/);
  assert.match(source, /\.\/shared\/wanko-library-store\.js\?v=1/);
  assert.match(source, /\.\/shared\/wanko-registration-request\.js\?v=1/);
  assert.match(source, /\.\/shared\/for-my-sons-db\.js\?v=4/);
  assert.match(source, /\.\/wanko-gacha\/\?v=8/);
  assert.match(source, /\.\/wanko-war\/\?v=26/);
  assert.match(source, /\.\/wanko-deck\/\?v=4/);
  assert.match(source, /\.\/paint\/\?v=10/);
  assert.match(source, /\.\/paint\/app\.js\?v=10/);
  assert.match(source, /\.\/company-town\/\?v=5/);
  assert.doesNotThrow(() => new vm.Script(source));
  assert.doesNotMatch(source, /\\n/);
});

test('Paint loads shared request dependencies before its app script', () => {
  const source = fs.readFileSync('paint/index.html', 'utf8');
  const db = source.indexOf('../shared/for-my-sons-db.js');
  const requests = source.indexOf('../shared/character-requests.js');
  const facade = source.indexOf('../shared/for-my-sons.js');
  const app = source.indexOf('./app.js?v=10');
  assert.ok(db >= 0 && requests > db && facade > requests && app > facade);
});

test('Paint retries pending requests without blocking startup', () => {
  const source = fs.readFileSync('paint/app.js', 'utf8');
  assert.match(source, /syncPending/);
  assert.match(source, /Character request retry deferred/);
});
