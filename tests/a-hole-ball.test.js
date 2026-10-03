const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('あ game ships five tilt-controlled scoring stages', () => {
  const source = fs.readFileSync('a-hole-ball/index.html', 'utf8');
  assert.match(source, /const STAGES = \[/);
  assert.equal((source.match(/\n\s*balls: \d+,/g) || []).length, 5);
  assert.match(source, /DeviceOrientationEvent\.requestPermission/);
  assert.match(source, /function transformForScreen\(beta, gamma\)/);
  assert.match(source, /function applyOperation\(hole\)/);
  assert.match(source, /function solveBallCollisions\(\)/);
  assert.match(source, /rollPhase/);
  assert.match(source, /moveDistance \/ Math\.max\(ball\.radius, \.001\)/);
  assert.match(source, /Math\.pow\(\.30, dt\)/);
  assert.match(source, /function drawLetterObstacle\(size\)/);
  assert.match(source, /function resolveObstacleCollision\(ball, previousX, previousY\)/);
  assert.match(source, /circleTouchesObstacle\(x, y, \.034\)/);
  assert.match(source, /strokeText\('あ'/);
  assert.match(source, /センサーなしで試す/);
});

test('あ game is linked from launcher and offline shell', () => {
  const apps = JSON.parse(fs.readFileSync('apps.json', 'utf8'));
  const entry = apps.find(app => app.id === 'a-hole-ball');
  assert.ok(entry);
  assert.equal(entry.name, 'あ');
  assert.equal(entry.url, './a-hole-ball/?v=3');
  assert.equal(entry.icon, './assets/a-hole-ball.svg?v=1');

  const sw = fs.readFileSync('service-worker.js', 'utf8');
  assert.match(sw, /\.\/a-hole-ball\/\?v=3/);
  assert.match(sw, /\.\/a-hole-ball\/index\.html/);
  assert.match(sw, /\.\/assets\/a-hole-ball\.svg\?v=1/);
});
