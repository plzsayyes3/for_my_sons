const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const VoiceMeter = require('../voice-meter/meter.js');
function harness(permission = 'granted') {
  const ids = {};
  for (const m of fs.readFileSync('voice-meter/index.html', 'utf8').matchAll(/id="([^"]+)"/g)) {
    ids[m[1]] = {textContent:'', value:m[1] === 'target' ? '55' : '', style:{}, attrs:{}, listeners:{},
      addEventListener(k, cb){this.listeners[k]=cb;}, setAttribute(k,v){this.attrs[k]=v;}};
  }
  const listeners = {}, frames = new Map(), props = {};
  let raw = 0, time = 0, stopped = 0, seq = 0, grant;
  const track = {stop(){stopped++;},addEventListener(){}};
  const stream = {getTracks:()=>[track]};
  class AudioContext {
    constructor(){this.state='running';} async resume(){} async close(){this.state='closed';}
    createMediaStreamSource(){return{connect(){},disconnect(){}};}
    createAnalyser(){return{fftSize:2048,disconnect(){},getFloatTimeDomainData(a){a.fill(raw);}};}
  }
  const document = {hidden:false,body:{dataset:{}},documentElement:{style:{setProperty(k,v){props[k]=v;}}},getElementById:id=>ids[id],addEventListener(k,f){listeners[k]=f;}};
  const navigator = {mediaDevices:{getUserMedia:()=>permission==='pending' ? new Promise(r=>{grant=r;}) : permission==='denied' ? Promise.reject(Object.assign(Error('no'),{name:'NotAllowedError'})) : Promise.resolve(stream)}};
  const window={AudioContext,isSecureContext:true,addEventListener(k,f){listeners[k]=f;}};
  vm.runInNewContext(fs.readFileSync('voice-meter/app.js','utf8'),{VoiceMeter,window,navigator,document,performance:{now:()=>time},requestAnimationFrame(f){frames.set(++seq,f);return seq;},cancelAnimationFrame(id){frames.delete(id);}});
  function advance(value) { raw=value;for(let i=0;i<100;i++){time+=17;const batch=[...frames.values()];frames.clear();batch.forEach(f=>f(time));} }
  return {ids,document,listeners,props,advance,get stopped(){return stopped;},grant(){grant(stream);}};
}
test('voice screen responds to soft, normal and large samples and its target slider', async()=>{
 const h=harness();await h.ids.toggle.listeners.click();
 h.advance(0);assert.equal(h.document.body.dataset.zone,'small');
 h.advance(0.02);assert.equal(h.document.body.dataset.zone,'normal');
 h.advance(0.25);assert.equal(h.document.body.dataset.zone,'large');
 h.ids.target.value='85';h.ids.target.listeners.input();h.advance(0.02);
 assert.equal(h.props['--target'],'85%');assert.equal(h.document.body.dataset.zone,'small');
 await h.ids.toggle.listeners.click();assert.equal(h.stopped,1);assert.equal(h.ids.meter.attrs['aria-valuenow'],'0');
});
test('voice screen gives a retryable permission denial message',async()=>{
 const h=harness('denied');await h.ids.toggle.listeners.click();
 assert.match(h.ids.status.textContent,/マイク許可/);assert.equal(h.ids.toggle.textContent,'はじめる');
});
test('backgrounding stops audio and late permission stays stopped',async()=>{
 const h=harness('pending');const pending=h.ids.toggle.listeners.click();
 h.document.hidden=true;h.listeners.visibilitychange();h.grant();await pending;
 assert.equal(h.stopped,1);assert.equal(h.ids.toggle.textContent,'はじめる');assert.equal(h.document.body.dataset.zone,'idle');
});
test('leaving an active screen releases its microphone',async()=>{
 const h=harness();await h.ids.toggle.listeners.click();h.listeners.pagehide();assert.equal(h.stopped,1);
});
