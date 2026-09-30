const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('company-town/index.html', 'utf8');

test('Company Town uses one visible pedestrian per 100 population', () => {
  assert.match(source, /Math\.floor\(state\.population\/100\)/);
  assert.match(source, /MAX_VISIBLE|Math\.min\(20,/);
});

test('Company Town unlock conditions match progression rules', () => {
  assert.match(source, /population30:state\.population>=30/);
  assert.match(source, /population50:state\.population>=50/);
  assert.match(source, /population100:state\.population>=100/);
  assert.match(source, /population150:state\.population>=150/);
  assert.match(source, /population200:state\.population>=200/);
  assert.match(source, /population300:state\.population>=300/);
  assert.match(source, /population500:state\.population>=500/);
  assert.match(source, /company2:state\.companyLevel>=2/);
  assert.match(source, /company3:state\.companyLevel>=3/);
  assert.match(source, /nature100:naturePoints\(\)>=100/);
  assert.match(source, /land15:purchasedLandCount\(\)>=15/);
});

test('Normal park contributes fifty nature points', () => {
  assert.match(source, /park:\{name:'公園',icon:'🌳',price:500_000,nature:50,moveIn:1/);
});

test('Company Town has hidden five-tap one-day-per-second debug mode', () => {
  assert.match(source, /debugTapCount>=5/);
  assert.match(source, /debugDayPerSecond:false/);
  assert.match(source, /for\(let d=0;d<state\.timeSpeed;d\+\+\)for\(let h=0;h<24;h\+\+\)advanceHour\(\)/);
});

test('Housing expands population capacity instead of adding residents instantly', () => {
  assert.match(source, /houses:\{name:'分譲戸建て4戸'.*capacity:20/);
  assert.match(source, /apartment:\{name:'マンション'.*capacity:100/);
  assert.match(source, /highrise:\{name:'高層マンション'.*capacity:300/);
  assert.match(source, /function housingCapacity\(\)/);
  assert.match(source, /function applyDailyMoveIn\(\)/);
  assert.match(source, /const moved=applyDailyMoveIn\(\)/);
});

test('Early community buildings unlock with population progression', () => {
  assert.match(source, /bakery:\{name:'パン屋'.*unlock:'population30'/);
  assert.match(source, /clinic:\{name:'クリニック'.*moveIn:2.*unlock:'population100'/);
  assert.match(source, /nursery:\{name:'保育園'.*moveIn:2.*unlock:'population150'/);
  assert.match(source, /postoffice:\{name:'郵便局'.*moveIn:1.*unlock:'population200'/);
  assert.match(source, /school:\{name:'小学校'.*moveIn:3.*unlock:'population300'/);
});

test('Company Town uses Kenney RPG Urban assets for ground and roads', () => {
  assert.match(source, /kenney\/rpg-urban\/grass\.png\?v=1/);
  assert.match(source, /kenney\/rpg-urban\/asphalt\.png\?v=1/);
  assert.match(source, /kenney\/rpg-urban\/pavement\.png\?v=1/);
  assert.match(source, /roadIntersection/);
});
