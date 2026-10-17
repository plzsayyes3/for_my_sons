(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PixelModel=api;})(globalThis,()=>{
  'use strict';
  const sizes=[8,16,24,32,48,64,80,100];
  function createWork(size,id,now){
    if(!sizes.includes(size))throw new Error('Unsupported size');
    return {id,name:'なまえのないえ',size,pixels:Array(size*size).fill(null),createdAt:now,updatedAt:now};
  }
  function validateGallery(g){
    if(!g||g.version!==1||!Array.isArray(g.works)||g.works.length===0)throw new Error('Invalid gallery');
    const ids=new Set();
    for(const w of g.works){
      if(!w||typeof w.id!=='string'||!w.id||ids.has(w.id)||typeof w.name!=='string'||w.name.length>80||!sizes.includes(w.size)||!Array.isArray(w.pixels)||w.pixels.length!==w.size*w.size||!w.pixels.every(c=>c===null||(typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c)))||typeof w.createdAt!=='string'||typeof w.updatedAt!=='string')throw new Error('Invalid work');
      ids.add(w.id);
    }
    if(!ids.has(g.activeId))throw new Error('Invalid active work');
    return JSON.parse(JSON.stringify(g));
  }
  function line(size,from,to){
    let {x,y}=from;const out=[];const dx=Math.abs(to.x-x),sx=x<to.x?1:-1,dy=-Math.abs(to.y-y),sy=y<to.y?1:-1;let err=dx+dy;
    if(![x,y,to.x,to.y].every(Number.isInteger))return out;
    // UI coordinates are bounded, but protect callers from unbounded loops.
    if(Math.max(dx,-dy)>4096)return out;
    for(;;){if(x>=0&&y>=0&&x<size&&y<size)out.push(y*size+x);if(x===to.x&&y===to.y)break;const e=2*err;if(e>=dy){err+=dy;x+=sx;}if(e<=dx){err+=dx;y+=sy;}}
    return out;
  }
  function fill(pixels,size,index,color){
    const next=pixels.slice();if(!Number.isInteger(index)||index<0||index>=next.length||next[index]===color)return next;
    const old=next[index],queue=[index];next[index]=color;
    while(queue.length){const i=queue.pop(),x=i%size,y=Math.floor(i/size);for(const n of [x>0?i-1:-1,x<size-1?i+1:-1,y>0?i-size:-1,y<size-1?i+size:-1])if(n>=0&&next[n]===old){next[n]=color;queue.push(n);}}
    return next;
  }
  function createHistory(limit=50){const stack=[];return{push(p){stack.push(p.slice());if(stack.length>limit)stack.shift();},undo(){return stack.pop()||null;},clear(){stack.length=0;},get length(){return stack.length;}};}
  return {createWork,validateGallery,line,fill,createHistory};
});
