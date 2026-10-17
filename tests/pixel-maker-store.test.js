const test=require('node:test');const assert=require('node:assert/strict');
const M=require('../pixel-maker/model.js');const {createGalleryStore}=require('../pixel-maker/store.js');
const gallery=(id)=>({version:1,activeId:id,works:[M.createWork(8,id,'now')]});
test('queued writes retain profile and snapshot, latest write is last',async()=>{
 const calls=[];let release;const gate=new Promise(r=>release=r);
 const api={save:{put:async(p,a,k,g)=>{if(!calls.length){calls.push([p,a,k,g]);await gate;}else calls.push([p,a,k,g]);}}};
 const s=createGalleryStore(api),g=gallery('a');const one=s.save('soma',g);g.works[0].name='changed';
 const two=s.save('sora',gallery('b'));const three=s.save('soma',g);release();await Promise.all([one,two,three]);await s.flush();
 assert.deepEqual(calls.map(c=>[c[0],c[3].activeId]),[['soma','a'],['sora','b'],['soma','a']]);
 assert.equal(calls[0][3].works[0].name,'なまえのないえ');assert.equal(calls[2][3].works[0].name,'changed');assert.equal(s.pending().length,0);
});
test('failed save is retained and retry persists it',async()=>{
 let fail=true;const writes=[];const s=createGalleryStore({save:{put:async(...args)=>{if(fail)throw Error('quota');writes.push(args);}}});
 await assert.rejects(s.save('soma',gallery('a')),/quota/);assert.equal(s.pending().length,1);
 fail=false;await s.retry();assert.equal(s.pending().length,0);assert.equal(writes[0][0],'soma');
});
test('missing record differs from corrupt data and load never writes',async()=>{
 let record=null,writes=0;const s=createGalleryStore({save:{get:async()=>record,put:async()=>writes++}});
 assert.equal(await s.load('soma'),null);record={value:{version:99}};
 await assert.rejects(s.load('soma'),/Invalid/);assert.equal(writes,0);
 record={value:gallery('a')};assert.equal((await s.load('soma')).activeId,'a');
});
test('newer successful snapshot supersedes failed old snapshot',async()=>{
 let count=0;const s=createGalleryStore({save:{put:async()=>{if(++count===1)throw Error('offline');}}});
 const first=s.save('soma',gallery('a'));const second=s.save('soma',gallery('b'));
 await assert.rejects(first);await second;await s.flush();assert.equal(s.pending().length,0);
});
test('raw non-JSON gallery envelope is refused without overwriting',async()=>{
 let writes=0;const s=createGalleryStore({save:{get:async()=>null,put:async()=>writes++}},{readRecord:async()=>({kind:'binary',value:[1,2]})});
 await assert.rejects(s.load('soma'),/Invalid/);assert.equal(writes,0);
});
