(() => {
  'use strict';
  const M=window.PixelModel,$=id=>document.getElementById(id);
  const board=$('board'),ctx=board.getContext('2d'),history=M.createHistory();
  const colors=[['くろ','#33443D'],['ねずみ','#81918B'],['しろ','#FFFFFF'],['ちゃいろ','#8F6251'],['あか','#E96865'],['オレンジ','#F39B57'],['きいろ','#F3CE62'],['クリーム','#F6E9B8'],['ふかみどり','#38745C'],['みどり','#77A46A'],['きみどり','#B9D488'],['ミント','#BCE0C7'],['こん','#3C536D'],['あお','#588ECA'],['そらいろ','#92C6E7'],['みずいろ','#C7E7EB'],['むらさき','#8C79BA'],['すみれ','#B8A5D5'],['ラベンダー','#DDD1E7'],['ピンク','#E59BB4'],['こいピンク','#C96591'],['もも','#F4C9C4'],['こげちゃ','#584940'],['ベージュ','#D6BCA0']];
  let api,store,gallery,profileId=null,tool='pen',color=colors[0][1],stroke=null,ready=false,saving=0,saveVersion=0;
  let switchQueue=Promise.resolve(),loadFailed=false;
  let zoom=100,moveMode=false,panGesture=null;
  const viewport=$('board-viewport'),surface=$('board-surface');
  const current=()=>gallery?.works.find(w=>w.id===gallery.activeId);
  const uid=()=>globalThis.crypto?.randomUUID?.()||`work-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  function status(text){$('save-state').textContent=text;}
  function notice(text=''){$('notice').textContent=text;}
  function enable(value){
    ready=value;
    for(const node of document.querySelectorAll('.tools button,#work-name,#open-gallery,#new-work,#export-png,.swatch,#zoom,#move-view'))node.disabled=!value;
    if(value)board.removeAttribute('aria-disabled');else board.setAttribute('aria-disabled','true');
    $('undo').disabled=!value||!history.length;
  }
  function renderPixels(context,work,grid=false){
    const side=context.canvas.width,cell=side/work.size;
    context.clearRect(0,0,side,side);context.imageSmoothingEnabled=false;
    work.pixels.forEach((c,i)=>{if(c){context.fillStyle=c;context.fillRect((i%work.size)*cell,Math.floor(i/work.size)*cell,cell,cell);}});
    if(grid){context.beginPath();context.strokeStyle='#71836a26';context.lineWidth=1;for(let i=1;i<work.size;i++){const x=Math.round(i*cell)+.5;context.moveTo(x,0);context.lineTo(x,side);context.moveTo(0,x);context.lineTo(side,x);}context.stroke();}
  }
  const rasterSide=(size,target=512)=>size*Math.ceil(target/size);
  function render(){const w=current();if(!w)return;const side=rasterSide(w.size);if(board.width!==side){board.width=board.height=side;}renderPixels(ctx,w,true);$('work-name').value=w.name;$('size-label').textContent=`${w.size} × ${w.size}`;$('undo').disabled=!ready||!history.length;}
  async function persist(){
    if(!gallery||!store||loadFailed)return false;
    const version=++saveVersion,id=profileId;saving++;status('ほぞんちゅう');
    try{await store.save(id,gallery);if(id===profileId&&version===saveVersion){status('ほぞんしたよ');$('retry').hidden=true;}return true;}
    catch(error){if(id===profileId){status('ほぞんできなかった');$('retry').hidden=false;notice('えは のこしてあるよ。「もういちど」を おしてね。');}return false;}
    finally{saving--;}
  }
  function changed(){current().updatedAt=new Date().toISOString();return persist();}
  function point(event){const r=board.getBoundingClientRect(),size=current().size;return{x:Math.max(-size,Math.min(size*2,Math.floor((event.clientX-r.left)/r.width*size))),y:Math.max(-size,Math.min(size*2,Math.floor((event.clientY-r.top)/r.height*size)))};}
  function paint(p){const w=current(),c=stroke.tool==='eraser'?null:color;const indices=M.line(w.size,stroke.last,p);for(const i of indices){if(w.pixels[i]!==c){w.pixels[i]=c;stroke.changed=true;}}stroke.last=p;renderPixels(ctx,w,true);}
  function finishStroke(){
    if(panGesture){const id=panGesture.id;panGesture=null;if(board.hasPointerCapture?.(id))board.releasePointerCapture(id);}
    if(!stroke)return Promise.resolve(true);
    const s=stroke;stroke=null;
    if(board.hasPointerCapture?.(s.id))board.releasePointerCapture(s.id);
    if(!s.changed)return Promise.resolve(true);
    history.push(s.before);render();return changed();
  }
  board.addEventListener('pointerdown',event=>{
    if(!ready||stroke||panGesture||(event.pointerType==='mouse'&&event.button!==0))return;
    if(moveMode){event.preventDefault();panGesture={id:event.pointerId,x:event.clientX,y:event.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};board.setPointerCapture(event.pointerId);return;}
    event.preventDefault();const p=point(event),w=current();if(p.x<0||p.y<0||p.x>=w.size||p.y>=w.size)return;
    stroke={id:event.pointerId,tool,last:p,before:w.pixels.slice(),changed:false};board.setPointerCapture(event.pointerId);
    if(tool==='fill'){const next=M.fill(w.pixels,w.size,p.y*w.size+p.x,color);stroke.changed=next.some((c,i)=>c!==w.pixels[i]);w.pixels=next;renderPixels(ctx,w,true);}else paint(p);
  });
  board.addEventListener('pointermove',event=>{
    if(panGesture?.id===event.pointerId){event.preventDefault();viewport.scrollLeft=panGesture.left-(event.clientX-panGesture.x);viewport.scrollTop=panGesture.top-(event.clientY-panGesture.y);return;}
    if(!stroke||event.pointerId!==stroke.id||stroke.tool==='fill')return;event.preventDefault();paint(point(event));
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])board.addEventListener(type,event=>{if(stroke?.id===event.pointerId||panGesture?.id===event.pointerId)void finishStroke();});
  function setMoveMode(value){moveMode=value;$('move-view').setAttribute('aria-pressed',String(value));board.style.cursor=value?'grab':'crosshair';notice(value?'えを なぞって ばしょを うごかそう。':'');}
  $('move-view').addEventListener('click',()=>{void finishStroke();setMoveMode(!moveMode);});
  $('zoom').addEventListener('input',()=>{
    if(!ready)return;void finishStroke();const next=Math.max(100,Math.min(800,Number($('zoom').value)||100)),ratio=next/zoom;
    const halfW=(viewport.clientWidth||0)/2,halfH=(viewport.clientHeight||0)/2;
    const left=((viewport.scrollLeft||0)+halfW)*ratio-halfW,top=((viewport.scrollTop||0)+halfH)*ratio-halfH;
    zoom=next;surface.style.width=`${zoom}%`;$('zoom-value').textContent=`${zoom}%`;
    viewport.scrollLeft=left;viewport.scrollTop=top;
  });
  for(const button of document.querySelectorAll('[data-tool]'))button.addEventListener('click',()=>{
    void finishStroke();setMoveMode(false);tool=button.dataset.tool;for(const b of document.querySelectorAll('[data-tool]'))b.setAttribute('aria-pressed',String(b===button));
  });
  colors.forEach(([name,hex],i)=>{
    const b=document.createElement('button');b.className='swatch';b.disabled=true;b.style.setProperty('--swatch',hex);if([2,6,7,10,11,14,15,18,21].includes(i))b.style.setProperty('--check','#3c5144');
    b.setAttribute('aria-label',name);b.title=name;b.setAttribute('aria-pressed',String(i===0));
    b.addEventListener('click',()=>{void finishStroke();color=hex;for(const s of $('palette').children)s.setAttribute('aria-pressed',String(s===b));$('selected-color').textContent=name;});$('palette').append(b);
  });
  $('undo').addEventListener('click',()=>{void finishStroke();const previous=history.undo();if(previous){current().pixels=previous;render();void changed();}});
  $('work-name').addEventListener('input',()=>{if(ready){current().name=$('work-name').value;void changed();}});
  function closeDialog(id){$(id).close();}
  for(const b of document.querySelectorAll('[data-close]'))b.addEventListener('click',()=>closeDialog(b.dataset.close));
  $('new-work').addEventListener('click',async()=>{await finishStroke();$('new-dialog').showModal();});
  for(const b of document.querySelectorAll('[data-size]'))b.addEventListener('click',async()=>{
    if(!ready)return;enable(false);
    // Save the current work before moving to a different work.
    if(!await persist()){enable(true);return;}
    const w=M.createWork(Number(b.dataset.size),uid(),new Date().toISOString());gallery.works.unshift(w);gallery.activeId=w.id;history.clear();closeDialog('new-dialog');enable(true);render();notice();await persist();
  });
  $('open-gallery').addEventListener('click',async()=>{
    await finishStroke();const grid=$('gallery-grid');grid.replaceChildren();
    for(const work of gallery.works){
      const b=document.createElement('button');b.className='work-card';const c=document.createElement('canvas');c.width=c.height=rasterSide(work.size,128);renderPixels(c.getContext('2d'),work);
      const name=document.createElement('strong');name.textContent=work.name||'なまえのないえ';const meta=document.createElement('small');meta.textContent=`${work.size} × ${work.size}`;b.append(c,name,meta);
      b.addEventListener('click',async()=>{if(!ready)return;enable(false);if(!await persist()){enable(true);return;}gallery.activeId=work.id;history.clear();closeDialog('gallery-dialog');enable(true);render();await persist();});grid.append(b);
    }
    $('gallery-dialog').showModal();
  });
  async function refreshProfiles(){
    const profiles=await api.profile.list();$('profile').replaceChildren();
    for(const p of profiles){const o=document.createElement('option');o.value=p.id;o.textContent=p.id==='profile-1'&&p.label==='profile-1'?'ゲスト':p.label;$('profile').append(o);}
    $('profile').value=profileId;$('profile').disabled=false;
  }
  async function loadSelected(){
    enable(false);$('profile').disabled=true;closeDialog('new-dialog');closeDialog('gallery-dialog');
    await finishStroke();
    try{
      if(store.pending().length)await store.retry();await store.flush();
      const p=await api.profile.current();const loaded=await store.load(p.id);
      profileId=p.id;loadFailed=false;history.clear();
      if(loaded)gallery=loaded;else{const w=M.createWork(16,uid(),new Date().toISOString());gallery={version:1,activeId:w.id,works:[w]};}
      await refreshProfiles();enable(true);render();notice();$('retry').hidden=true;
      if(!loaded)await persist();else status('ほぞんしたよ');
    }catch(error){
      // Keep the previous gallery in memory, but never save it as the requested profile.
      loadFailed=true;status('よみこめなかった');$('retry').hidden=false;notice('えを まもるために とめているよ。「もういちど」で やりなおせるよ。');$('profile').disabled=true;
    }
  }
  function queueLoad(){enable(false);switchQueue=switchQueue.catch(()=>{}).then(loadSelected);return switchQueue;}
  $('profile').addEventListener('change',async()=>{
    const wanted=$('profile').value;enable(false);$('profile').disabled=true;
    await finishStroke();
    try{if(store.pending().length)await store.retry();await store.flush();await api.profile.setCurrent(wanted);}
    catch(error){$('profile').value=profileId;$('profile').disabled=false;enable(true);status('ほぞんできなかった');$('retry').hidden=false;notice('いまのえを ほぞんしてから きりかえよう。');}
  });
  window.addEventListener('for-my-sons-profile-changed',()=>void queueLoad());
  $('retry').addEventListener('click',async()=>{
    if(!store){await init();return;}
    if(loadFailed){await queueLoad();return;}
    $('retry').disabled=true;try{await store.retry();status('ほぞんしたよ');$('retry').hidden=true;notice();}catch{status('ほぞんできなかった');notice('まだ ほぞんできないみたい。えは のこしてあるよ。');}finally{$('retry').disabled=false;}
  });
  $('export-png').addEventListener('click',async()=>{
    await finishStroke();const w=current();if(!w)return;
    const image=document.createElement('canvas');image.width=image.height=rasterSide(w.size);renderPixels(image.getContext('2d'),w);
    const name=(w.name||'ドットえ').replace(/[\x00-\x1f\\/:*?"<>|]/g,'_').slice(0,60)+'.png';
    $('export-png').disabled=true;
    try{
      const blob=await new Promise((resolve,reject)=>image.toBlob(b=>b?resolve(b):reject(Error('PNG failed')),'image/png'));const file=new File([blob],name,{type:'image/png'});
      let shared=false;
      if(navigator.canShare?.({files:[file]})&&navigator.share){try{await navigator.share({files:[file],title:w.name||'ドットえ'});shared=true;}catch(error){if(error.name==='AbortError')throw error;}}
      if(shared)notice('がぞうに できたよ。');
      else{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);notice('がぞうを ほぞんしたよ。');}
    }catch(error){notice(error.name==='AbortError'?'また いつでも がぞうにできるよ。':'がぞうに できなかったよ。もういちど おしてね。');}
    finally{$('export-png').disabled=!ready;}
  });
  $('go-home').addEventListener('click',async event=>{
    if(!store||loadFailed)return;
    event.preventDefault();enable(false);await finishStroke();
    try{if(store.pending().length)await store.retry();await store.flush();location.href='../';}
    catch{enable(true);notice('えを ほぞんできなかったよ。「もういちど」を おしてね。');$('retry').hidden=false;}
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)void finishStroke();});
  window.addEventListener('blur',()=>void finishStroke());
  window.addEventListener('beforeunload',event=>{if(saving||store?.pending().length||stroke?.changed){event.preventDefault();event.returnValue='';}});
  async function init(){
    try{
      enable(false);const db=await window.ForMySonsDB.openDatabase();
      api=await window.ForMySonsShared.createForMySons({db});
      store=window.PixelStore.createGalleryStore(api,{readRecord:id=>db.get('saves',[id,'pixel-maker','gallery'])});
      await queueLoad();
    }
    catch{status('じゅんびできなかった');notice('このブラウザーで ほぞんが つかえるか かくにんしてね。');$('retry').hidden=false;}
  }
  void init();
})();
