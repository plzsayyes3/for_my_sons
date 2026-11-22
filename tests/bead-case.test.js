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
  assert.equal(app.url, './bead-case/?v=2');
  assert.equal(app.category, 'create');
  assert.ok(fs.existsSync('assets/bead-case.svg'));
  const sw = fs.readFileSync('service-worker.js', 'utf8');
  assert.match(sw, /\.\/bead-case\/\?v=1/);
  assert.match(sw, /\.\/assets\/bead-case\.svg\?v=1/);
});

test('bead-case uses flat-plane gravity, device tilt, and display rotation', async () => {
  const html=fs.readFileSync('bead-case/index.html','utf8');
  const match=html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match);
  const code=match[1].replace('many(38);requestAnimationFrame(frame);',
    'window.__inspectGravity=function(){return {x:gravityX,y:gravityY,ready:motionGravityReady,on:tiltOn,hasTilt:hasTilt};};many(38);requestAnimationFrame(frame);');
  const handlers={},sensorHandlers={},nodes=new Map(),noOp=()=>{};
  for(const id of ['case','canvas','count','status','tilt','palette','add','shake','clear']){
    nodes.set(id,{
      textContent:'',classList:{add(){},remove(){}},setAttribute(){},
      getBoundingClientRect(){return {width:520,height:540,left:0,top:0};},
      addEventListener(type,fn){handlers[id+':'+type]=fn;},setPointerCapture(){}
    });
  }
  const ctx={};
  for(const m of ['setTransform','clearRect','beginPath','ellipse','fill','stroke','arc',
    'moveTo','lineTo','closePath','strokeRect','save','restore','translate','rotate'])ctx[m]=noOp;
  ctx.createRadialGradient=()=>({addColorStop:noOp});
  nodes.get('canvas').getContext=()=>ctx;
  const fakeWindow={
    screen:{orientation:{angle:0}},devicePixelRatio:2,
    addEventListener(type,fn){sensorHandlers[type]=fn;},
    removeEventListener(type){delete sensorHandlers[type];},
    DeviceMotionEvent:function(){},DeviceOrientationEvent:function(){}
  };
  const permitted={requestPermission:async()=> 'granted'};
  vm.runInNewContext(code,{
    window:fakeWindow,document:{getElementById:id=>nodes.get(id),querySelectorAll:()=>[]},
    ResizeObserver:class{observe(){}},
    performance:{now:()=>1234},
    requestAnimationFrame:noOp,setTimeout:noOp,
    DeviceMotionEvent:permitted,DeviceOrientationEvent:permitted
  });
  const inspect=()=>fakeWindow.__inspectGravity();
  await handlers['tilt:click']();
  assert.equal(inspect().on,true);
  sensorHandlers.deviceorientation({beta:0,gamma:0});
  assert.equal(inspect().x,0);
  assert.equal(inspect().y,0, 'level surface must not pull beads to the bottom');
  sensorHandlers.devicemotion({
    accelerationIncludingGravity:{x:0,y:0,z:9.81},
    acceleration:{x:0,y:0,z:0}
  });
  assert.equal(inspect().ready,true);
  assert.equal(inspect().x,0);
  assert.equal(inspect().y,0);
  sensorHandlers.devicemotion({
    accelerationIncludingGravity:{x:-4.9,y:0,z:8.49},
    acceleration:{x:0,y:0,z:0}
  });
  assert.ok(inspect().x>20,'lower right edge pulls beads right');
  const before=inspect().x;
  sensorHandlers.deviceorientation({beta:90,gamma:0});
  assert.equal(inspect().x,before,'orientation fallback cannot override valid motion gravity');
  fakeWindow.screen.orientation.angle=90;
  sensorHandlers.devicemotion({
    accelerationIncludingGravity:{x:0,y:9.81,z:0},
    acceleration:{x:0,y:0,z:0}
  });
  assert.ok(inspect().x < -500,'landscape screen rotation maps device y into screen x');
  assert.equal(inspect().y,0);
  await handlers['tilt:click']();
  assert.equal(inspect().on,false);
  assert.equal(inspect().ready,false);
});
