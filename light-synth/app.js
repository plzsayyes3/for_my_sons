(function(){
'use strict';
const canvas=document.querySelector('#light-canvas'),ctx=canvas.getContext('2d',{alpha:false});
const simulation=LightSynth.createSimulation();
const pointers=new Map();
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let paused=reduced,automatic=true,last=0,frameId=null,width=1,height=1,dpr=1;
let pulse=0.5;
const pauseButton=document.querySelector('#pause'),autoButton=document.querySelector('#auto');
const stateLabel=document.querySelector('#stage-state'),hint=document.querySelector('#hint');
function announce(text){document.querySelector('#announcement').textContent=text;}
function updateTransport(){
  pauseButton.setAttribute('aria-pressed',String(paused));
  pauseButton.textContent=paused?'▷ うごかす':'Ⅱ とめる';
  autoButton.setAttribute('aria-pressed',String(automatic));
  autoButton.querySelector('b').textContent=automatic?'ON':'OFF';
  stateLabel.textContent=paused?'ひかりを とめています':automatic?'ひかりが ながれています':'さわると ひかりが うまれるよ';
}
function background(){ctx.globalCompositeOperation='source-over';ctx.fillStyle='#060914';ctx.fillRect(0,0,width,height);}
function resize(){
  const rect=canvas.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);
  dpr=Math.min(window.devicePixelRatio||1,2,Math.sqrt(4000000/(width*height)));
  canvas.width=Math.max(1,Math.round(width*dpr));canvas.height=Math.max(1,Math.round(height*dpr));
  ctx.setTransform(dpr,0,0,dpr,0,0);background();draw(0,true);
}
function draw(dt,still=false){
  ctx.globalCompositeOperation='source-over';ctx.fillStyle=`rgba(6,9,20,${still?1:1-Math.exp(-dt*3.8)})`;ctx.fillRect(0,0,width,height);
  ctx.globalCompositeOperation='lighter';
  const scale=Math.min(width,height);
  for(const p of simulation.particles){
    const fade=Math.max(0,1-p.age/p.life);
    const birth=Math.min(1,p.age/0.15);
    const opacity=fade*birth*(0.55+0.2*pulse);
    const x=p.x*width,y=p.y*height,r=p.size*1.4;
    ctx.strokeStyle=`hsla(${p.hue},90%,70%,${opacity*0.6})`;
    ctx.lineWidth=p.size*0.8;ctx.lineCap='round';ctx.beginPath();
    // A short luminous tail also makes freshly resized or paused scenes legible.
    ctx.moveTo(still?x-p.vx*scale*0.055:p.px*width,still?y-p.vy*scale*0.055:p.py*height);
    ctx.lineTo(x,y);ctx.stroke();
    ctx.fillStyle=`hsla(${p.hue},95%,65%,${opacity*0.045})`;ctx.beginPath();ctx.arc(x,y,r*5,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=`hsla(${p.hue},90%,75%,${opacity*0.5})`;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=`rgba(230,250,255,${opacity*0.6})`;ctx.beginPath();ctx.arc(x,y,r*0.35,0,Math.PI*2);ctx.fill();
  }
  ctx.globalCompositeOperation='source-over';
}
function frame(timestamp){
  frameId=null;
  if(paused||document.hidden){last=0;return;}
  const dt=last?Math.min((timestamp-last)/1000,0.05):1/60;last=timestamp;
  const result=simulation.step(dt,{automatic,pointers:[...pointers.values()]});pulse=result.pulse;
  draw(dt);frameId=requestAnimationFrame(frame);
}
function schedule(){if(frameId===null&&!paused&&!document.hidden){last=0;frameId=requestAnimationFrame(frame);}}
function stopFrame(){if(frameId!==null)cancelAnimationFrame(frameId);frameId=null;last=0;pointers.clear();}
for(const input of document.querySelectorAll('[data-param]')){
  const label=input.closest('.control');
  function sync(){
    const value=Number(input.value);simulation.setParameter(input.dataset.param,value/100);
    label.style.setProperty('--angle',`${-135+value*2.7}deg`);
    label.style.setProperty('--fill',`${value*0.75}%`);
    label.querySelector('output').value=String(value);
    input.setAttribute('aria-valuetext',`${value} パーセント`);
  }
  input.addEventListener('input',sync);
  const dial=label.querySelector('.dial');
  let drag=null;
  dial.addEventListener('pointerdown',event=>{
    if(event.pointerType==='mouse'&&event.button!==0)return;
    event.preventDefault();drag={id:event.pointerId,x:event.clientX,y:event.clientY,value:Number(input.value)};
    dial.setPointerCapture(event.pointerId);input.focus({preventScroll:true});
  });
  dial.addEventListener('pointermove',event=>{
    if(!drag||drag.id!==event.pointerId)return;
    input.value=String(Math.round(Math.max(0,Math.min(100,drag.value+(event.clientX-drag.x-(event.clientY-drag.y))*0.7))));sync();
  });
  for(const name of ['pointerup','pointercancel','lostpointercapture'])dial.addEventListener(name,()=>{drag=null;});
  window.addEventListener('blur',()=>{drag=null;});
  sync();
}
function point(event){const rect=canvas.getBoundingClientRect();return {id:event.pointerId,x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))};}
canvas.addEventListener('pointerdown',event=>{
  if(event.pointerType==='mouse'&&event.button!==0)return;
  if(paused)return;
  event.preventDefault();const p=point(event);pointers.set(event.pointerId,p);simulation.emit(p.x,p.y,7);
  canvas.setPointerCapture(event.pointerId);hint.classList.add('hidden');
});
canvas.addEventListener('pointermove',event=>{if(pointers.has(event.pointerId))pointers.set(event.pointerId,point(event));});
for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,event=>pointers.delete(event.pointerId));
window.addEventListener('blur',()=>pointers.clear());
pauseButton.addEventListener('click',()=>{paused=!paused;if(paused)stopFrame();else schedule();updateTransport();announce(paused?'ひかりを とめました':'ひかりを うごかします');});
autoButton.addEventListener('click',()=>{automatic=!automatic;updateTransport();announce(automatic?'じどうで ひかりを うみだします':'さわって ひかりを うみだそう');});
document.querySelector('#clear').addEventListener('click',()=>{simulation.clear();pointers.clear();background();announce('ひかりを けしました');});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopFrame();else schedule();});
window.addEventListener('pagehide',stopFrame);window.addEventListener('pageshow',schedule);
new ResizeObserver(resize).observe(canvas);
updateTransport();resize();schedule();
})();
