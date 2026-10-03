/* Particle-built Playfair lettering. No all-pairs links or external resources. */
(() => {
  'use strict';
  const hero=document.getElementById('labParticleHero');
  const canvas=document.getElementById('labParticles');
  const wordmark=hero?.querySelector('.particle-wordmark');
  if(!hero||!canvas||!wordmark)return;
  const hint=hero.querySelector('.lab-particle-hint');
  const t=(key,fallback)=>window.EILanguage?.t(key,{},fallback)||fallback;
  let context;
  try{context=canvas.getContext('2d',{alpha:true});}catch(_){return;}
  if(!context)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const compact=matchMedia('(max-width:700px)');
  function updateHint(){
    if(!hint)return;
    hint.textContent=reduced.matches?t('lab.particleHintStill','Embodied Intelligence Lab'):
      compact.matches?t('lab.particleHintTouch','Touch to explore · Tap to scatter'):t('lab.particleHint','Move to explore · Click to scatter');
  }
  let width=0,height=0,dpr=1,count=0,gap=1.8,raf=0,lastTime=0;
  let visible=true,disposed=false,ready=false,settled=false,resizePending=false;
  let pulseAge=10,pulseStrength=0,color='',accent='';
  let homes=new Float32Array(0),positions=new Float32Array(0),velocities=new Float32Array(0),pulse=new Float32Array(0);
  const pointer={x:0,y:0,px:0,py:0,tx:0,ty:0,active:false,presence:0};
  let press=null;
  const random=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};

  function colors(){
    const style=getComputedStyle(hero);
    // Resolve CSS custom colors through a normal color property, including var().
    color=getComputedStyle(wordmark).color;
    accent=style.getPropertyValue('--lab-particle-accent').trim()||color;
  }
  function stop(){cancelAnimationFrame(raf);raf=0;lastTime=0;}
  function canRun(){return !disposed&&visible&&!document.hidden&&!reduced.matches&&ready;}
  function wake(){
    settled=false;
    if(canRun()&&!raf){lastTime=0;raf=requestAnimationFrame(tick);}
  }
  function render(){
    context.setTransform(dpr,0,0,dpr,0,0);
    context.clearRect(0,0,width,height);
    if(!ready||reduced.matches)return;
    // Two batched paths keep draw calls bounded regardless of particle count.
    const dotRadius=Math.min(1.38,Math.max(.8,gap*.44));
    for(let layer=0;layer<2;layer++){
      context.fillStyle=layer?accent:color;
      context.globalAlpha=layer?.86:.94;
      context.beginPath();
      for(let i=0;i<count;i++){
        if((i%17===0?1:0)!==layer)continue;
        const j=i*2,x=positions[j],y=positions[j+1],r=dotRadius*(layer?1.12:1);
        context.moveTo(x+r,y);context.arc(x,y,r,0,Math.PI*2);
      }
      context.fill();
    }
    context.globalAlpha=1;
  }
  function fallback(){
    ready=false;stop();hero.classList.remove('particles-ready');
    context.clearRect(0,0,canvas.width,canvas.height);
  }
  function build(){
    resizePending=false;if(disposed)return;
    const bounds=hero.getBoundingClientRect(),box=wordmark.getBoundingClientRect();
    if(bounds.width<1||bounds.height<1||box.width<1){fallback();return;}
    width=bounds.width;height=bounds.height;
    dpr=Math.min(devicePixelRatio||1,compact.matches?1.25:1.5,Math.sqrt(950000/(width*height)));
    canvas.width=Math.max(1,Math.round(width*dpr));canvas.height=Math.max(1,Math.round(height*dpr));
    colors();
    if(reduced.matches){fallback();updateHint();return;}
    const off=document.createElement('canvas');off.width=Math.ceil(box.width);off.height=Math.ceil(box.height);
    const mask=off.getContext('2d',{willReadFrequently:true});if(!mask){fallback();return;}
    const style=getComputedStyle(wordmark),lines=compact.matches?['Embodied','Intelligence']:['Embodied Intelligence'];
    let size=parseFloat(style.fontSize)||60;
    const setFont=()=>{mask.font=`400 ${size}px ${style.fontFamily}`;if('letterSpacing' in mask)mask.letterSpacing=style.letterSpacing==='normal'?'0px':style.letterSpacing;};
    setFont();
    while(size>25&&Math.max(...lines.map(line=>mask.measureText(line).width))>box.width-4){size-=1;setFont();}
    mask.fillStyle='#000';mask.textBaseline='alphabetic';
    const leading=size*1.04,totalHeight=leading*lines.length;
    const top=Math.max(0,(box.height-totalHeight)/2);
    lines.forEach((line,index)=>{
      const metrics=mask.measureText(line),ascent=metrics.actualBoundingBoxAscent||size*.76,descent=metrics.actualBoundingBoxDescent||size*.21;
      mask.fillText(line,1,top+index*leading+(leading-ascent-descent)/2+ascent);
    });
    let pixels;
    try{pixels=mask.getImageData(0,0,off.width,off.height).data;}catch(_){fallback();return;}
    const samples=[],sampleGap=compact.matches?1.65:1.8;
    for(let y=.6;y<off.height;y+=sampleGap){
      for(let x=.6;x<off.width;x+=sampleGap){
        if(pixels[(Math.floor(y)*off.width+Math.floor(x))*4+3]>100)samples.push(x,y);
      }
    }
    const available=samples.length/2,limit=compact.matches?2100:4800;
    count=Math.min(limit,available);if(count<20){fallback();return;}
    gap=sampleGap*Math.sqrt(available/count);
    homes=new Float32Array(count*2);positions=new Float32Array(count*2);
    velocities=new Float32Array(count*2);pulse=new Float32Array(count*2);
    for(let i=0;i<count;i++){
      const sample=Math.floor(i*available/count)*2,j=i*2;
      const x=box.left-bounds.left+samples[sample],y=box.top-bounds.top+samples[sample+1];
      homes[j]=positions[j]=x;homes[j+1]=positions[j+1]=y;
    }
    pointer.active=false;pointer.presence=0;pulseAge=10;
    ready=true;hero.classList.add('particles-ready');
    updateHint();
    render();settled=true;stop();
  }
  function requestBuild(){
    if(disposed||resizePending)return;resizePending=true;
    requestAnimationFrame(()=>{if(resizePending)build();});
  }
  function tick(now){
    raf=0;if(!canRun()){lastTime=0;return;}
    const dt=lastTime?Math.min(.1,Math.max(0,(now-lastTime)/1000)):1/60;lastTime=now;
    pulseAge+=dt;
    const blend=1-Math.exp(-dt*32),presenceBlend=1-Math.exp(-dt*18);
    pointer.px=pointer.x;pointer.py=pointer.y;
    pointer.x+=(pointer.tx-pointer.x)*blend;pointer.y+=(pointer.ty-pointer.y)*blend;
    pointer.presence+=((pointer.active?1:0)-pointer.presence)*presenceBlend;
    const sx=pointer.x-pointer.px,sy=pointer.y-pointer.py,segmentLength=sx*sx+sy*sy;
    const radius=compact.matches?76:108,r2=radius*radius;
    const burst=pulseAge<4?(1-Math.exp(-pulseAge*16))*Math.exp(-pulseAge*1.8)*pulseStrength:0;
    const omega=24,decay=Math.exp(-omega*dt);let movement=0;
    for(let i=0;i<count;i++){
      const j=i*2,hx=homes[j],hy=homes[j+1];let tx=hx+pulse[j]*burst,ty=hy+pulse[j+1]*burst;
      if(pointer.presence>.001){
        const along=segmentLength>.01?Math.max(0,Math.min(1,((hx-pointer.px)*sx+(hy-pointer.py)*sy)/segmentLength)):1;
        const dx=hx-(pointer.px+sx*along),dy=hy-(pointer.py+sy*along);
        const influence=Math.exp(-(dx*dx+dy*dy)*2/r2)*pointer.presence*1.25;
        tx+=dx*influence;ty+=dy*influence;
      }
      const dx=positions[j]-tx,dy=positions[j+1]-ty;
      const bx=velocities[j]+omega*dx,by=velocities[j+1]+omega*dy;
      const nx=tx+(dx+bx*dt)*decay,ny=ty+(dy+by*dt)*decay;
      movement+=Math.abs(nx-positions[j])+Math.abs(ny-positions[j+1]);
      positions[j]=nx;positions[j+1]=ny;
      velocities[j]=(velocities[j]-omega*bx*dt)*decay;velocities[j+1]=(velocities[j+1]-omega*by*dt)*decay;
    }
    render();
    const pointerSettled=Math.abs(pointer.presence-(pointer.active?1:0))<.002&&Math.abs(pointer.x-pointer.tx)+Math.abs(pointer.y-pointer.ty)<.04;
    settled=pulseAge>=4&&pointerSettled&&movement/count<.002;
    if(!settled)raf=requestAnimationFrame(tick);else lastTime=0;
  }
  function updatePointer(event){
    if(reduced.matches||!ready)return;
    const box=hero.getBoundingClientRect();pointer.tx=event.clientX-box.left;pointer.ty=event.clientY-box.top;
    if(!pointer.active){pointer.x=pointer.px=pointer.tx;pointer.y=pointer.py=pointer.ty;}
    pointer.active=true;wake();
  }
  function scatter(event){
    if(reduced.matches||!ready)return;
    const box=hero.getBoundingClientRect(),x=event.clientX-box.left,y=event.clientY-box.top;
    pulseAge=0;pulseStrength=compact.matches?75:112;
    for(let i=0;i<count;i++){
      const j=i*2,dx=homes[j]-x,dy=homes[j+1]-y,length=Math.hypot(dx,dy)||1;
      const angle=random(i+7)*Math.PI*2,variation=.48+random(i+19)*.52;
      pulse[j]=(dx/length*.78+Math.cos(angle)*.22)*variation;
      pulse[j+1]=(dy/length*.78+Math.sin(angle)*.22)*variation;
    }
    wake();
  }
  function onDown(event){
    if(event.target.closest?.('a,button,input,select,textarea'))return;
    if(event.button!==undefined&&event.button!==0)return;
    press={id:event.pointerId,x:event.clientX,y:event.clientY,cancelled:false};updatePointer(event);
  }
  function onMove(event){
    if(event.pointerType==='touch'){
      if(!press||press.id!==event.pointerId||press.cancelled)return;
      const dx=Math.abs(event.clientX-press.x),dy=Math.abs(event.clientY-press.y);
      if(dy>10&&dy>dx*1.15){press.cancelled=true;pointer.active=false;wake();return;}
    }
    updatePointer(event);
  }
  function onUp(event){
    if(press&&press.id===event.pointerId&&!press.cancelled&&Math.hypot(event.clientX-press.x,event.clientY-press.y)<10)scatter(event);
    press=null;if(event.pointerType==='touch'){pointer.active=false;wake();}
  }
  function onLeave(){press=null;pointer.active=false;wake();}
  function onVisibility(){if(document.hidden)stop();else if(!settled)wake();}
  function onTheme(){colors();render();}
  function onReduced(){build();}
  function onPageHide(event){stop();if(!event.persisted)dispose();}
  function onPageShow(event){if(event.persisted){requestBuild();}}
  function dispose(){
    if(disposed)return;disposed=true;stop();observer?.disconnect();resizeObserver?.disconnect();
    hero.removeEventListener('pointerdown',onDown);hero.removeEventListener('pointermove',onMove);
    hero.removeEventListener('pointerup',onUp);hero.removeEventListener('pointerleave',onLeave);hero.removeEventListener('pointercancel',onLeave);
    document.removeEventListener('visibilitychange',onVisibility);window.removeEventListener('site-theme-change',onTheme);
    window.removeEventListener('site-language-change',updateHint);
    window.removeEventListener('resize',requestBuild);window.removeEventListener('pagehide',onPageHide);window.removeEventListener('pageshow',onPageShow);
    reduced.removeEventListener?.('change',onReduced);compact.removeEventListener?.('change',requestBuild);
  }
  hero.addEventListener('pointerdown',onDown,{passive:true});hero.addEventListener('pointermove',onMove,{passive:true});
  hero.addEventListener('pointerup',onUp,{passive:true});hero.addEventListener('pointerleave',onLeave,{passive:true});hero.addEventListener('pointercancel',onLeave,{passive:true});
  document.addEventListener('visibilitychange',onVisibility);window.addEventListener('site-theme-change',onTheme);
  window.addEventListener('site-language-change',updateHint);
  window.addEventListener('resize',requestBuild,{passive:true});window.addEventListener('pagehide',onPageHide);window.addEventListener('pageshow',onPageShow);
  reduced.addEventListener?.('change',onReduced);compact.addEventListener?.('change',requestBuild);
  const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
    visible=entries[0].isIntersecting;if(!visible)stop();else if(!settled)wake();
  },{rootMargin:'80px'}):null;
  const resizeObserver=typeof ResizeObserver==='function'?new ResizeObserver(requestBuild):null;
  observer?.observe(hero);resizeObserver?.observe(hero);resizeObserver?.observe(wordmark);
  build();
  document.fonts?.ready.then(()=>{if(!disposed)requestBuild();});
  document.fonts?.load('400 72px "Playfair Display"').then(()=>{if(!disposed)requestBuild();}).catch(()=>{});
})();
