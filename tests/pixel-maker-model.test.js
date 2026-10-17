const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../pixel-maker/model.js');
test('new works have supported sizes and transparent cells', () => {
  for (const size of [8,16,32]) assert.deepEqual(M.createWork(size,'one','today').pixels, Array(size*size).fill(null));
  assert.throws(()=>M.createWork(12,'one','today'));
});
test('interpolation fills diagonal and excludes outside cells', () => {
  assert.deepEqual(M.line(16,{x:0,y:0},{x:3,y:3}),[0,17,34,51]);
  assert.deepEqual(M.line(8,{x:-2,y:0},{x:2,y:0}),[0,1,2]);
  assert.deepEqual(M.line(8,{x:8,y:0},{x:9,y:0}),[]);
});
test('fill respects walls, four-way connectivity and transparency', () => {
  const p=Array(64).fill(null); for(let y=0;y<8;y++)p[y*8+3]='#000000';
  const q=M.fill(p,8,0,'#FF0000');
  assert.equal(q[2],'#FF0000'); assert.equal(q[4],null); assert.equal(p[0],null);
  assert.deepEqual(M.fill(q,8,0,'#FF0000'),q);
  assert.equal(M.fill(q,8,0,null)[0],null);
  const corners=Array(64).fill('#000000'); corners[0]=corners[9]=null;
  assert.equal(M.fill(corners,8,0,'#FF0000')[9],null);
});
test('history clones snapshots and retains only 50 operations', () => {
  const h=M.createHistory(); const p=[null];h.push(p);p[0]='#000000';assert.deepEqual(h.undo(),[null]);
  for(let i=0;i<51;i++)h.push([i]);for(let i=50;i>0;i--)assert.deepEqual(h.undo(),[i]);
  assert.equal(h.undo(),null);h.push([1]);h.clear();assert.equal(h.undo(),null);
});
test('gallery validation refuses invalid pixels, duplicate ids and absent active work', () => {
  const w=M.createWork(8,'one',new Date().toISOString()); const g={version:1,activeId:w.id,works:[w]};
  assert.deepEqual(M.validateGallery(g),g);
  assert.throws(()=>M.validateGallery({...g,works:[w,w]}));
  assert.throws(()=>M.validateGallery({...g,activeId:'absent'}));
  assert.throws(()=>M.validateGallery({...g,works:[{...w,pixels:['bad']}]}));
  assert.throws(()=>M.validateGallery({...g,works:[{...w,pixels:Array(64).fill('red')}]}));
});
