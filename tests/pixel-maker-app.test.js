const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const M=require('../pixel-maker/model.js'),S=require('../pixel-maker/store.js');
const source=fs.readFileSync(require.resolve('../pixel-maker/app.js'),'utf8');
function harness(options={}){
  class Element{
    constructor(tag='div'){this.tag=tag;this.children=[];this.dataset={};this.attrs={};this.style={setProperty(){}};this.listeners={};this.disabled=false;this.hidden=false;this.value='';this.textContent='';this.width=this.height=512;this.calls=[];}
    addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
    async fire(type,extra={}){for(const fn of this.listeners[type]||[])await fn({preventDefault(){},...extra});}
    setAttribute(k,v){this.attrs[k]=v;}removeAttribute(k){delete this.attrs[k];}hasPointerCapture(){return false;}setPointerCapture(){}releasePointerCapture(){}
    append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}showModal(){this.open=true;}close(){this.open=false;}remove(){}click(){this.clicked=true;}
    getBoundingClientRect(){return{left:0,top:0,width:512,height:512};}
    getContext(){if(!this.context){const calls=this.calls;this.context={canvas:this,clearRect(...x){calls.push(['clear',...x]);},fillRect(...x){calls.push(['fill',this.fillStyle,...x]);},beginPath(){calls.push(['grid']);},moveTo(){},lineTo(){},stroke(){}};}return this.context;}
    toBlob(callback){callback(new Blob(['png'],{type:'image/png'}));}
  }
  const ids={};for(const match of fs.readFileSync(require.resolve('../pixel-maker/index.html'),'utf8').matchAll(/id="([^"]+)"/g))ids[match[1]]=new Element();
  const tools=['pen','eraser','fill'].map(t=>{const b=new Element('button');b.dataset.tool=t;return b;});
  const sizes=[...fs.readFileSync(require.resolve('../pixel-maker/index.html'),'utf8').matchAll(/data-size="(\d+)"/g)].map(m=>{const b=new Element('button');b.dataset.size=m[1];return b;});
  const closers=['new-dialog','gallery-dialog'].map(id=>{const b=new Element();b.dataset.close=id;return b;});
  const document=new Element();document.body=new Element();document.getElementById=id=>ids[id];document.createElement=tag=>new Element(tag);
  document.querySelectorAll=selector=>selector==='[data-tool]'?tools:selector==='[data-size]'?sizes:selector==='[data-close]'?closers:[...tools,...['work-name','open-gallery','new-work','export-png','undo'].map(id=>ids[id]),...ids.palette.children];
  const window=new Element();const records=new Map(),writes=[];let selected='soma',fail=false;
  const api={profile:{current:async()=>({id:selected,label:selected}),list:async()=>['soma','sora'].map(id=>({id,label:id})),setCurrent:async id=>{selected=id;void window.fire('for-my-sons-profile-changed');}},save:{get:async id=>{if(options.corrupt)return{value:{version:99}};return records.has(id)?{value:records.get(id)}:null;},put:async(id,a,k,value)=>{if(fail)throw Error('quota');const g=JSON.parse(JSON.stringify(value));records.set(id,g);writes.push([id,g]);}}};
  window.PixelModel=M;window.PixelStore=S;window.ForMySonsShared={createForMySons:async()=>api};
  window.ForMySonsDB={openDatabase:async()=>({get:async(_table,key)=>{const record=await api.save.get(key[0]);return record?{kind:'json',...record}:null;}})};
  const images=[];const originalCreate=document.createElement;document.createElement=tag=>{const e=originalCreate(tag);if(tag==='canvas')images.push(e);return e;};
  const timers=[];vm.runInNewContext(source,{window,document,navigator:options.navigator||{},crypto:{randomUUID:()=>`id-${Math.random()}`},Blob,File,URL:{createObjectURL:()=> 'blob:png',revokeObjectURL(){}},setTimeout:fn=>timers.push(fn),location:{href:''},console});
  return{ids,tools,sizes,window,document,records,writes,images,api,setFail:v=>fail=v};
}
const settle=async()=>{for(let i=0;i<12;i++)await new Promise(r=>setImmediate(r));};
async function stroke(h,from,to){const e={pointerId:1,pointerType:'touch',clientX:from[0],clientY:from[1]};await h.ids.board.fire('pointerdown',e);if(to)await h.ids.board.fire('pointermove',{...e,clientX:to[0],clientY:to[1]});await h.ids.board.fire('pointerup',e);await settle();}
test('app draws interpolated stroke, undoes it and creates separate work',async()=>{
 const h=harness();await settle();assert.equal(h.ids['save-state'].textContent,'ほぞんしたよ');
 await stroke(h,[16,16],[112,112]);let w=h.records.get('soma').works[0];assert.equal(w.pixels.filter(Boolean).length,4);
 await h.ids.undo.fire('click');await settle();assert.equal(h.records.get('soma').works[0].pixels.filter(Boolean).length,0);
 await h.sizes[0].fire('click');await settle();assert.equal(h.records.get('soma').works.length,2);assert.equal(h.records.get('soma').works[0].size,8);
});
test('100-square work exports whole integer pixels and survives zoom changes',async()=>{
 const h=harness();await settle();assert.deepEqual(h.sizes.map(b=>Number(b.dataset.size)),[8,16,24,32,48,64,80,100]);
 await h.sizes.at(-1).fire('click');await settle();await stroke(h,[1,1]);
 const before=JSON.stringify(h.records.get('soma'));h.ids.zoom.value='400';await h.ids.zoom.fire('input');await settle();
 assert.equal(h.ids['board-surface'].style.width,'400%');assert.equal(h.ids['zoom-value'].textContent,'400%');assert.equal(JSON.stringify(h.records.get('soma')),before);
 await h.ids['export-png'].fire('click');const c=h.images.at(-1);assert.equal(c.width%100,0);assert.equal(c.height,c.width);assert.equal(c.calls.find(x=>x[0]==='fill')[4],6);
});
test('move mode pans the enlarged canvas without drawing',async()=>{
 const h=harness();await settle();const before=JSON.stringify(h.records.get('soma'));h.ids['board-viewport'].scrollLeft=100;h.ids['board-viewport'].scrollTop=100;
 await h.ids['move-view'].fire('click');await stroke(h,[10,10],[30,40]);
 assert.equal(h.ids['board-viewport'].scrollLeft,80);assert.equal(h.ids['board-viewport'].scrollTop,70);assert.equal(JSON.stringify(h.records.get('soma')),before);
});
test('drawing after zoom and pan maps screen position to original square cells',async()=>{
 const h=harness();await settle();h.ids.zoom.value='400';await h.ids.zoom.fire('input');
 h.ids.board.getBoundingClientRect=()=>({left:-700,top:-700,width:2048,height:2048});
 await stroke(h,[200,200]);const p=h.records.get('soma').works[0].pixels;assert.equal(p[7*16+7],'#33443D');assert.equal(p.filter(Boolean).length,1);
});
test('app saves stroke outside canvas and isolates profile galleries',async()=>{
 const h=harness();await settle();await stroke(h,[16,16],[560,16]);assert.equal(h.records.get('soma').works[0].pixels.filter(Boolean).length,16);
 h.ids.profile.value='sora';await h.ids.profile.fire('change');await settle();assert.equal(h.records.get('sora').works[0].pixels.filter(Boolean).length,0);
 await stroke(h,[16,16]);h.ids.profile.value='soma';await h.ids.profile.fire('change');await settle();assert.equal(h.records.get('soma').works[0].pixels.filter(Boolean).length,16);
});
test('app keeps unsaved image on failure, blocks profile switch and retries',async()=>{
 const h=harness();await settle();h.setFail(true);await stroke(h,[16,16]);assert.equal(h.ids['save-state'].textContent,'ほぞんできなかった');
 h.ids.profile.value='sora';await h.ids.profile.fire('change');await settle();assert.equal(h.ids.profile.value,'soma');
 h.setFail(false);await h.ids.retry.fire('click');await settle();assert.equal(h.records.get('soma').works[0].pixels[0],'#33443D');
});
test('corrupt gallery disables editing and is not overwritten',async()=>{
 const h=harness({corrupt:true});await settle();assert.equal(h.writes.length,0);assert.equal(h.ids['work-name'].disabled,true);assert.equal(h.ids['save-state'].textContent,'よみこめなかった');
});
test('PNG rendering excludes grid and leaves transparent cells untouched',async()=>{
 const h=harness();await settle();await stroke(h,[16,16]);await h.ids['export-png'].fire('click');await settle();
 const c=h.images.at(-1);assert.equal(c.width,512);assert.equal(c.height,512);assert.equal(c.calls.filter(x=>x[0]==='grid').length,0);assert.deepEqual(c.calls.filter(x=>x[0]==='fill'),[['fill','#33443D',0,0,32,32]]);
});
test('share cancellation keeps drawing usable and can export again',async()=>{
 let count=0;const h=harness({navigator:{canShare:()=>true,share:async()=>{count++;throw Object.assign(Error('cancel'),{name:'AbortError'});}}});await settle();
 await h.ids['export-png'].fire('click');assert.match(h.ids.notice.textContent,/また/);assert.equal(h.ids['export-png'].disabled,false);await h.ids['export-png'].fire('click');assert.equal(count,2);
});
test('share permission failure falls back to a downloadable PNG',async()=>{
 const h=harness({navigator:{canShare:()=>true,share:async()=>{throw Object.assign(Error('gesture lost'),{name:'NotAllowedError'});}}});await settle();
 await h.ids['export-png'].fire('click');assert.equal(h.document.body.children.some(e=>e.download?.endsWith('.png')&&e.clicked),true);
});
