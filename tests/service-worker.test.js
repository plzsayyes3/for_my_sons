const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('service worker precaches character request assets under a new cache version', () => {
  const source = fs.readFileSync('service-worker.js', 'utf8');
  assert.match(source, /for-my-sons-v48/);
  assert.match(source, /\.\/shared\/character-requests\.js\?v=2/);
  assert.match(source, /\.\/shared\/wanko-library-store\.js\?v=1/);
  assert.match(source, /\.\/shared\/for-my-sons-db\.js\?v=2/);
});

test('Paint loads shared request dependencies before its app script', () => {
  const source = fs.readFileSync('paint/index.html', 'utf8');
  const db = source.indexOf('../shared/for-my-sons-db.js');
  const requests = source.indexOf('../shared/character-requests.js');
  const facade = source.indexOf('../shared/for-my-sons.js');
  const app = source.indexOf('./app.js?v=7');
  assert.ok(db >= 0 && requests > db && facade > requests && app > facade);
});

test('Paint retries pending requests without blocking startup', () => {
  const source = fs.readFileSync('paint/app.js', 'utf8');
  assert.match(source, /syncPending/);
  assert.match(source, /Character request retry deferred/);
});
