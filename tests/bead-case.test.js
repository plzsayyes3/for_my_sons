const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('bead-case starts, renders, adds, shakes and clears without external dependencies', () => {
  const html = fs.readFileSync('bead-case/index.html', 'utf8');
  const src = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(src, 'standalone script exists');
  assert.doesNotThrow(() => new vm.Script(src[1]));

  const events = {};
  const nodes = new Map();
  const ids = ['case', 'canvas', 'count', 'status', 'tilt', 'palette', 'add', 'shake', 'clear'];
  for (const id of ids) {
    nodes.set(id, {
      textContent: '',
      classList: { add() {}, remove() {} },
      setAttribute() {},
      getBoundingClientRect() { return { width: 520, height: 540, left: 0, top: 0 }; },
      addEventListener(type, handler) { events[id + ':' + type] = handler; },
      setPointerCapture() {}
    });
  }
  const noOp = () => {};
  const ctx = {};
  for (const name of ['setTransform', 'clearRect', 'beginPath', 'ellipse', 'fill', 'stroke', 'arc',
    'moveTo', 'lineTo', 'closePath', 'strokeRect', 'save', 'restore', 'translate', 'rotate']) ctx[name] = noOp;
  ctx.createRadialGradient = () => ({ addColorStop: noOp });
  nodes.get('canvas').getContext = () => ctx;

  const doc = {
    getElementById(id) { return nodes.get(id); },
    querySelectorAll() { return []; }
  };
  const win = { devicePixelRatio: 2, addEventListener: noOp };
  let animation;
  vm.runInNewContext(src[1], {
    document: doc, window: win, ResizeObserver: class { observe() {} },
    performance: { now: () => 0 }, requestAnimationFrame(fn) { animation = fn; },
    setTimeout: noOp, Math
  }, { timeout: 2000 });

  assert.equal(nodes.get('count').textContent, '38 こ');
  assert.equal(typeof animation, 'function');
  assert.doesNotThrow(() => animation(16), 'animation draws and simulates');
  events['add:click']();
  assert.equal(nodes.get('count').textContent, '50 こ');
  assert.doesNotThrow(() => events['shake:click']());
  events['clear:click']();
  assert.equal(nodes.get('count').textContent, '0 こ');
  events['canvas:pointerdown']({
    preventDefault: noOp, pointerId: 1, clientX: 120, clientY: 160
  });
  events['canvas:pointerup']({ pointerId: 1, clientX: 120, clientY: 160 });
  assert.equal(nodes.get('count').textContent, '1 こ');
});

test('bead-case is listed and offline-cached', () => {
  const apps = JSON.parse(fs.readFileSync('apps.json', 'utf8'));
  const app = apps.find(a => a.id === 'bead-case');
  assert.equal(app.url, './bead-case/?v=1');
  assert.equal(app.category, 'create');
  assert.ok(fs.existsSync('assets/bead-case.svg'));
  const sw = fs.readFileSync('service-worker.js', 'utf8');
  assert.match(sw, /\.\/bead-case\/\?v=1/);
  assert.match(sw, /\.\/assets\/bead-case\.svg\?v=1/);
});