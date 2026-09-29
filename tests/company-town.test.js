const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('company-town/index.html', 'utf8');

test('Company Town uses one visible pedestrian per 100 population', () => {
  assert.match(source, /Math\.floor\(state\.population\/100\)/);
  assert.match(source, /MAX_VISIBLE|Math\.min\(20,/);
});

test('Company Town unlock conditions match progression rules', () => {
  assert.match(source, /population50:state\.population>=50/);
  assert.match(source, /population100:state\.population>=100/);
  assert.match(source, /population200:state\.population>=200/);
  assert.match(source, /company2:state\.companyLevel>=2/);
  assert.match(source, /company3:state\.companyLevel>=3/);
  assert.match(source, /nature100:naturePoints\(\)>=100/);
  assert.match(source, /land15:purchasedLandCount\(\)>=15/);
});

test('Normal park contributes fifty nature points', () => {
  assert.match(source, /park:\{name:'公園',icon:'🌳',price:500_000,pop:50,nature:50/);
});

test('Company Town has hidden five-tap one-day-per-second debug mode', () => {
  assert.match(source, /debugTapCount>=5/);
  assert.match(source, /debugDayPerSecond:false/);
  assert.match(source, /for\(let d=0;d<state\.timeSpeed;d\+\+\)for\(let h=0;h<24;h\+\+\)advanceHour\(\)/);
});
