'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../ghost-typing/index.html'), 'utf8');
const start = html.indexOf('function finish(reason){');
const end = html.indexOf('function completeWord(){', start);
assert.ok(start >= 0 && end > start, 'The battle result handler must exist');

const finishSource = html.slice(start, end);
const runResult = new Function('params', `
  const {yourBase, ghostBase, score, ghostScore}=params;
  let mode='playing', finished=false, roundCode='', raf=0, best={score:99999};
  const errors=0, events=[];
  const byId=new Map();
  const el=id=>{
    if(!byId.has(id))byId.set(id,{textContent:'',hidden:true,blur(){}});
    return byId.get(id);
  };
  const cancelAnimationFrame=()=>{};
  const updateBest=()=>{};
  const localStorage={setItem(){}};
  const encodeGhost=()=> 'TEST-CODE';
  ${finishSource}
  finish('base');
  return {
    title:el('resultTitle').textContent,
    detail:el('resultDetail').textContent,
    visible:el('result').hidden===false,
    finished
  };
`);

for (const {scenario,yourBase,ghostBase,score,ghostScore,title} of [
  {scenario:'player defeats ghost base',yourBase:360,ghostBase:0,score:1244,ghostScore:610,title:'🎉 かった！'},
  {scenario:'ghost defeats player base',yourBase:0,ghostBase:360,score:1244,ghostScore:610,title:'👻 まけちゃった'},
  {scenario:'base HP outranks opponent score',yourBase:210,ghostBase:100,score:100,ghostScore:3000,title:'🎉 かった！'},
  {scenario:'higher typing score cannot reverse HP loss',yourBase:100,ghostBase:210,score:3000,ghostScore:100,title:'👻 まけちゃった'},
  {scenario:'tie in HP goes to player score',yourBase:180,ghostBase:180,score:400,ghostScore:200,title:'🎉 スコアでかった！'},
  {scenario:'tie in HP goes to ghost score',yourBase:180,ghostBase:180,score:200,ghostScore:400,title:'👻 スコアでまけちゃった'},
  {scenario:'fully tied battle',yourBase:180,ghostBase:180,score:400,ghostScore:400,title:'🤝 ひきわけ！'},
  {scenario:'both bases destroyed: score tiebreaker',yourBase:0,ghostBase:0,score:500,ghostScore:400,title:'🎉 スコアでかった！'},
  {scenario:'both bases destroyed and tied',yourBase:0,ghostBase:0,score:500,ghostScore:500,title:'🤝 ひきわけ！'}
]) {
  test(scenario, ()=>{
    const result=runResult({yourBase,ghostBase,score,ghostScore});
    assert.equal(result.title,title);
    assert.ok(result.visible);
    assert.ok(result.finished);
    assert.match(result.detail, new RegExp(String(yourBase)+' / ゴースト '+String(ghostBase)));
  });
}
