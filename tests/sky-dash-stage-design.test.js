const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('sky-dash-sample/index.html', 'utf8');

test('Sky Dash keeps core controls and progression rules', () => {
  for (const id of ['left','right','jump','level','meters','prefecture','stageNo','scoreValue','progress','continueBtn','quitBtn']) {
    assert.match(source, new RegExp('id="' + id + '"'));
  }
  assert.match(source, /const STAGE_LENGTH=500;/);
  assert.match(source, /const PASS_SCORE=70;/);
  assert.match(source, /changeScore\(-10\);/);
  assert.match(source, /changeScore\(5\);/);
  assert.match(source, /pendingNextIndex=state\.stageIndex;/);
  assert.match(source, /すすむ（3秒後スタート）/);
  assert.match(source, /location\.href="\.\.\/";/);
});

test('stage data is separated from shared environment renderers', () => {
  assert.match(source, /const STAGE_ROUTE=\[/);
  assert.match(source, /\["東京都","city",null,[^\]]+,"tokyo"\]/);
  assert.match(source, /\["神奈川県","sea",null,[^\]]+,"kanagawa"\]/);
  assert.match(source, /\["山梨県","mountain",null,[^\]]+,"yamanashi"\]/);
  assert.match(source, /\["静岡県","sea","mountain",[^\]]+,"shizuoka"\]/);
  for (const fn of ['addCityScenery','addSeaScenery','addMountainScenery','addRiverScenery','applyStageTheme']) {
    assert.match(source, new RegExp('function ' + fn + '\\('));
  }
  const routeBlock = source.slice(source.indexOf('const STAGE_ROUTE=['), source.indexOf('].map(([name,environment,mix,accent,landmark=null])'));
  const prefectureRows = routeBlock.match(/\["[^"]+","(?:city|sea|mountain|river)"/g) || [];
  assert.equal(prefectureRows.length, 47);
});

test('first four stages have distinct landmark treatments', () => {
  assert.match(source, /stage\.landmark==="tokyo"/);
  assert.match(source, /stage\.landmark==="kanagawa"/);
  assert.match(source, /stage\.landmark==="yamanashi"/);
  assert.match(source, /stage\.landmark==="shizuoka"/);
  assert.match(source, /const water=new THREE\.Mesh/);
  assert.match(source, /new THREE\.ConeGeometry\(10\.5,15,7\)/);
  assert.match(source, /new THREE\.ConeGeometry\(8\.7,13\.5,7\)/);
});

test('responsive UI and special neon effects remain bounded', () => {
  assert.match(source, /viewport-fit=cover/);
  assert.match(source, /env\(safe-area-inset-top\)/);
  assert.match(source, /env\(safe-area-inset-right\)/);
  assert.match(source, /env\(safe-area-inset-bottom\)/);
  assert.match(source, /env\(safe-area-inset-left\)/);
  assert.match(source, /@media\(max-width:700px\)/);
  assert.match(source, /@media\(min-width:701px\) and \(max-width:1100px\)/);
  assert.match(source, /@media\(max-height:500px\) and \(orientation:landscape\)/);
  assert.match(source, /body\.boosting #progress/);
  assert.match(source, /clearLayer\.classList\.toggle\('neon-clear',state\.score>=90\)/);
});

test('rendering stays on lightweight primitive geometry and capped pixel ratio', () => {
  assert.match(source, /Math\.min\(devicePixelRatio,1\.35\)/);
  assert.match(source, /THREE\.PCFShadowMap/);
  assert.doesNotMatch(source, /ShaderMaterial/);
});
