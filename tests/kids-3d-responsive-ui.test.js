const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('kids-3d-playgrand/index.html', 'utf8');

test('all existing 3D controls remain present after responsive UI hardening', () => {
  for (const id of [
    'copy','del','multi','group','ungroup','export',
    'cloudProfile','cloudSave','cloudLoad','cloudPrevious','newProject',
    'applyCut','swap','snap','home',
    'newProjectDialog','cancelNewProject','confirmNewProject'
  ]) assert.match(source, new RegExp('id="' + id + '"'));
  for (const mode of ['translate','rotate','scale']) {
    assert.match(source, new RegExp('data-mode="' + mode + '"'));
  }
  for (const shape of ['box','sphere','cylinder','cone']) {
    assert.match(source, new RegExp('data-add="' + shape + '"'));
  }
});

test('top, middle and bottom bars stay scrollable instead of shrinking button labels', () => {
  assert.match(source, /\.bar\{[^}]*overflow-x:auto/);
  assert.match(source, /\.btn\{[^}]*flex:0 0 auto/);
  assert.match(source, /\.btn\{[^}]*white-space:nowrap/);
  assert.match(source, /\.btn\{[^}]*min-height:44px/);
  assert.match(source, /#opHelp\{[^}]*white-space:nowrap/);
});

test('viewport and safe-area handling cover iPhone and iPad browser or standalone modes', () => {
  assert.match(source, /height:100vh;height:100svh;height:100dvh/);
  assert.match(source, /env\(safe-area-inset-top\)/);
  assert.match(source, /env\(safe-area-inset-right\)/);
  assert.match(source, /env\(safe-area-inset-bottom\)/);
  assert.match(source, /env\(safe-area-inset-left\)/);
  assert.match(source, /-webkit-text-size-adjust:100%/);
});

test('phone and short landscape layouts have dedicated responsive rules', () => {
  assert.match(source, /@media\(max-width:700px\)/);
  assert.match(source, /@media\(max-height:500px\) and \(orientation:landscape\)/);
  assert.match(source, /@media\(min-width:701px\) and \(max-width:1100px\)/);
  const landscape = source.slice(source.indexOf('@media(max-height:500px) and (orientation:landscape)'));
  assert.match(landscape, /\.btn\{min-height:44px/);
});

test('stage overlays are separated on narrow screens and constrained on tablet widths', () => {
  assert.match(source, /\.status\{[^}]*max-width:min\(320px,45%\)/);
  const phone = source.slice(source.indexOf('@media(max-width:700px)'), source.indexOf('@media(max-height:500px)'));
  assert.match(phone, /\.hint\{top:auto;bottom:8px/);
  assert.match(phone, /\.status\{top:8px/);
  assert.match(phone, /\.error\{[^}]*bottom:72px/);
});

test('new-project dialog remains usable in short landscape viewports', () => {
  assert.match(source, /dialog\{[^}]*max-height:calc\(100dvh/);
  assert.match(source, /dialog\{[^}]*overflow:auto/);
  const phone = source.slice(source.indexOf('@media(max-width:700px)'), source.indexOf('@media(max-height:500px)'));
  assert.match(phone, /\.dialogActions\{display:grid;grid-template-columns:1fr 1fr\}/);
});
