const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
function make(options={}) {
  assert.ok(fs.existsSync('light-synth/model.js'), 'light simulation exists');
  return require('../light-synth/model.js').createSimulation({random:()=>0.5,...options});
}
test('automatic emission starts a scene and turning it off leaves an empty scene alone',()=>{
  const s=make(); s.step(0.05,{automatic:true}); assert.ok(s.particles.length>0);
  s.clear(); s.step(0.05,{automatic:false}); assert.equal(s.particles.length,0);
});
test('pointer emission occurs at normalized touch locations even without auto',()=>{
  const s=make(); s.step(0.05,{automatic:false,pointers:[{x:0.2,y:0.7},{x:0.8,y:0.3}]});
  assert.ok(s.particles.some(p=>Math.abs(p.x-0.2)<0.05));
  assert.ok(s.particles.some(p=>Math.abs(p.x-0.8)<0.05));
});
test('gravity pulls light down and orbit bends a straight path',()=>{
  const straight=make(), falling=make(), orbit=make();
  for(const s of [straight,falling,orbit]) {s.setParameter('gravity',0);s.setParameter('randomness',0);s.setParameter('orbit',0);s.emit(0.5,0.5,1);}
  falling.setParameter('gravity',1);orbit.setParameter('orbit',1);
  for(let i=0;i<10;i++)for(const s of [straight,falling,orbit])s.step(0.02,{automatic:false});
  assert.ok(falling.particles[0].y>straight.particles[0].y);
  assert.ok(Math.abs(orbit.particles[0].x-straight.particles[0].x)>0.001);
});
test('randomness changes movement, rhythm changes the emission pattern',()=>{
  const a=make({random:()=>0.8}),b=make({random:()=>0.8});
  for(const s of [a,b]) {s.setParameter('gravity',0);s.setParameter('orbit',0);s.setParameter('randomness',0);s.emit(0.5,0.5,1);}
  b.setParameter('randomness',1);for(let i=0;i<10;i++){a.step(0.02,{automatic:false});b.step(0.02,{automatic:false});}
  assert.ok(Math.abs(a.particles[0].x-b.particles[0].x)>0.0001);
  const slow=make(),fast=make(); slow.setParameter('rhythm',0);fast.setParameter('rhythm',1);
  for(let i=0;i<8;i++){slow.step(0.05,{automatic:true});fast.step(0.05,{automatic:true});}
  assert.notEqual(slow.particles.length,fast.particles.length);
});
test('continuous touch stays bounded and particles expire',()=>{
  const s=make({maxParticles:80});
  for(let i=0;i<1000;i++)s.step(0.05,{automatic:true,pointers:[{x:0.2,y:0.5},{x:0.8,y:0.5}]});
  assert.ok(s.particles.length<=80);assert.ok(s.particles.length>0);
  for(let i=0;i<130;i++)s.step(0.05,{automatic:false});assert.equal(s.particles.length,0);
});
test('invalid inputs remain finite and a long frame advances by at most 50 ms',()=>{
  const s=make();s.emit(0.5,0.5,1);s.step(50,{automatic:false});assert.equal(s.particles[0].age,0.05);
  const age=s.particles[0].age;
  for(const dt of [NaN,Infinity,-1])s.step(dt,{automatic:false});assert.equal(s.particles[0].age,age);
  s.setParameter('gravity',Infinity);s.setParameter('orbit',-2);s.setParameter('rhythm',4);
  assert.ok(Number.isFinite(s.params.gravity));assert.equal(s.params.orbit,0);assert.equal(s.params.rhythm,1);
  s.emit(NaN,Infinity,10);s.step(0.05,{automatic:false});
  assert.ok(s.particles.every(p=>[p.x,p.y,p.vx,p.vy].every(Number.isFinite)));
});
test('launcher and offline shell resolve every light synth asset within the project',()=>{
  const apps=JSON.parse(fs.readFileSync('apps.json'));
  assert.ok(apps.some(a=>a.id==='light-synth'&&a.category==='create'&&a.url==='./light-synth/?v=2'));
  const shell=fs.readFileSync('service-worker.js','utf8');
  for(const path of ['light-synth/index.html','light-synth/style.css','light-synth/model.js','light-synth/app.js','assets/light-synth.svg']){
    assert.ok(fs.existsSync(path),path);assert.ok(shell.includes('./'+path),path+' offline');
  }
});
test('automatic light density is consistent between 30 Hz and 120 Hz displays',()=>{
  function countAt(fps){const s=make();for(let i=0;i<fps*2;i++)s.step(1/fps,{automatic:true});return s.particles.length;}
  assert.ok(Math.abs(countAt(30)-countAt(120))<=3,'both automatic light streams survive on high-refresh displays');
});
test('amount immediately thins existing lights and greatly increases emission',()=>{
 const s=make();s.emit(.5,.5,500);s.setParameter('amount',0);assert.ok(s.particles.length<=16);
 function density(v){const a=make();a.setParameter('amount',v);for(let i=0;i<20;i++)a.step(.05,{automatic:true});return a.particles.length;}
 assert.ok(density(1)>density(0)*15);
});
test('strong controls visibly redirect lights that already exist',()=>{
 const s=make();s.emit(.5,.5,1);s.setParameter('gravity',1);s.step(.05,{automatic:false});assert.ok(s.particles[0].vy>.12);
});
