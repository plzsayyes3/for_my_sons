const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const file = 'voice-meter/meter.js';
function api() { assert.ok(fs.existsSync(file), 'voice meter implementation exists'); return require('../' + file); }
test('silence stays at zero and louder samples raise the relative level', () => {
  const { levelFromSamples } = api();
  assert.equal(levelFromSamples(new Float32Array(64)), 0);
  const quiet = levelFromSamples(new Float32Array(64).fill(0.005));
  const loud = levelFromSamples(new Float32Array(64).fill(0.2));
  assert.ok(quiet > 0 && loud > quiet && loud <= 100);
});
test('target controls the three voice zones', () => {
  const { zoneFor } = api();
  assert.equal(zoneFor(10, 55), 'small');
  assert.equal(zoneFor(45, 55), 'normal');
  assert.equal(zoneFor(70, 55), 'large');
  assert.equal(zoneFor(45, 40), 'large');
});
function audioEnv(getUserMedia) {
  const track = { stopped: false, stop() { this.stopped = true; }, addEventListener() {} };
  const stream = { getTracks: () => [track] };
  const contexts = [];
  class AudioContext {
    constructor() { this.state = 'running'; contexts.push(this); }
    async resume() {}
    async close() { this.state = 'closed'; }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createAnalyser() { return { fftSize: 2048, disconnect() {}, getFloatTimeDomainData(a) { a.fill(0.1); } }; }
  }
  return { track, stream, contexts, env: { AudioContext, mediaDevices: { getUserMedia: getUserMedia || (async () => stream) } } };
}
test('stopping releases microphone and audio context', async () => {
  const { createMeter } = api(); const f = audioEnv(); const m = createMeter(f.env);
  assert.equal(await m.start(), true); assert.ok(m.read() > 0);
  m.stop(); assert.equal(f.track.stopped, true); assert.equal(f.contexts[0].state, 'closed'); assert.equal(m.read(), 0);
});
test('late microphone permission cannot restart a stopped meter', async () => {
  const { createMeter } = api(); let grant; const f = audioEnv(() => new Promise(r => { grant = r; }));
  const m = createMeter(f.env); const pending = m.start(); m.stop(); grant(f.stream);
  assert.equal(await pending, false); assert.equal(f.track.stopped, true); assert.equal(m.read(), 0);
});
test('permission rejection cleans up and allows retry', async () => {
  const { createMeter } = api(); let allowed = false; const f = audioEnv(async () => {
    if (!allowed) throw Object.assign(new Error('denied'), { name: 'NotAllowedError' }); return f.stream;
  });
  const m = createMeter(f.env); await assert.rejects(m.start(), { name: 'NotAllowedError' });
  assert.equal(f.contexts[0].state, 'closed'); allowed = true; assert.equal(await m.start(), true); m.stop();
});
test('setup failure after permission releases the acquired stream', async () => {
  const { createMeter } = api(); const f = audioEnv();
  f.env.AudioContext.prototype.createAnalyser = () => { throw Error('setup failed'); };
  const m = createMeter(f.env); await assert.rejects(m.start(), /setup failed/); assert.equal(f.track.stopped, true);
});
test('launcher and offline shell include the voice meter', () => {
  const apps = JSON.parse(fs.readFileSync('apps.json'));
  assert.ok(apps.some(a => a.id === 'voice-meter' && a.category === 'tool'));
  assert.match(fs.readFileSync('service-worker.js', 'utf8'), /voice-meter\/meter.js/);
});
