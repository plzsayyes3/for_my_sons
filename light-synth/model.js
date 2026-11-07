(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.LightSynth=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
  function createSimulation(options={}){
    const random=options.random||Math.random;
    const maxParticles=Number.isFinite(options.maxParticles)?clamp(Math.floor(options.maxParticles),1,600):600;
    const particles=[];
    const params={gravity:0.12,rhythm:0.35,randomness:0.2,orbit:0.45};
    let time=0,autoCredit=0,secondaryCredit=0;
    const pointerCredits=new Map();
    function setParameter(name,value){
      if(Object.hasOwn(params,name)&&Number.isFinite(value))params[name]=clamp(value,0,1);
    }
    function emit(x,y,count=1){
      if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(count))return;
      count=clamp(Math.floor(count),0,maxParticles);
      const overflow=particles.length+count-maxParticles;
      if(overflow>0)particles.splice(0,overflow);
      for(let i=0;i<count;i++){
        const angle=random()*Math.PI*2;
        const speed=0.06+random()*0.12;
        particles.push({x:clamp(x,0,1),y:clamp(y,0,1),px:clamp(x,0,1),py:clamp(y,0,1),
          vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,age:0,life:4+random()*2,
          hue:(time*17+random()*65+165)%360,seed:random()*Math.PI*2,size:0.7+random()*1.5});
      }
    }
    function step(dt,{automatic=true,pointers=[]}={}){
      if(!Number.isFinite(dt)||dt<=0)return;
      dt=Math.min(dt,0.05);time+=dt;
      const pulse=0.5+0.5*Math.sin(time*(0.3+params.rhythm*1.7)*Math.PI*2);
      if(automatic){
        autoCredit+=dt*(25+55*pulse);
        const count=Math.floor(autoCredit);autoCredit-=count;
        const x=0.5+Math.sin(time*0.37)*0.24,y=0.43+Math.sin(time*0.53)*0.2;
        emit(x,y,count);
        secondaryCredit+=count/2;
        const secondaryCount=Math.floor(secondaryCredit);secondaryCredit-=secondaryCount;
        emit(1-x,0.86-y,secondaryCount);
      }else {autoCredit=0;secondaryCredit=0;}
      const active=new Set();
      for(let i=0;i<pointers.length;i++){
        const p=pointers[i],key=p.id??i;active.add(key);
        let credit=(pointerCredits.get(key)||0)+dt*90;
        const count=Math.floor(credit);credit-=count;pointerCredits.set(key,credit);
        emit(p.x,p.y,count);
      }
      for(const key of pointerCredits.keys())if(!active.has(key))pointerCredits.delete(key);
      const turn=params.orbit*3.5*dt,c=Math.cos(turn),s=Math.sin(turn);
      for(let i=particles.length-1;i>=0;i--){
        const p=particles[i];p.age+=dt;
        if(p.age>=p.life){particles.splice(i,1);continue;}
        p.px=p.x;p.py=p.y;
        const vx=p.vx*c-p.vy*s,vy=p.vx*s+p.vy*c;
        p.vx=vx+Math.cos(time*3.2+p.seed)*params.randomness*0.32*dt;
        p.vy=vy+params.gravity*0.26*dt+Math.sin(time*2.7+p.seed)*params.randomness*0.32*dt;
        const speed=Math.hypot(p.vx,p.vy);if(speed>0.65){p.vx*=0.65/speed;p.vy*=0.65/speed;}
        p.x+=p.vx*dt;p.y+=p.vy*dt;
        // Soft reflection keeps light in view as gravity and orbit are explored.
        if(p.x<0.015){p.x=0.015;p.vx=Math.abs(p.vx)*0.85;}
        if(p.x>0.985){p.x=0.985;p.vx=-Math.abs(p.vx)*0.85;}
        if(p.y<0.015){p.y=0.015;p.vy=Math.abs(p.vy)*0.85;}
        if(p.y>0.985){p.y=0.985;p.vy=-Math.abs(p.vy)*0.85;}
      }
      return {time,pulse};
    }
    function clear(){particles.length=0;autoCredit=0;secondaryCredit=0;pointerCredits.clear();}
    return {particles,params,setParameter,emit,step,clear};
  }
  return {createSimulation};
});
