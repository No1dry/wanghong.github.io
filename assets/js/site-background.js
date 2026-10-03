/* Native Canvas port of the supplied KineticGrid. No content, dependencies or input capture. */
(() => {
  'use strict';
  if (document.getElementById('site-kinetic-background')) return;
  const canvas = document.createElement('canvas');
  let ctx;
  try {ctx = canvas.getContext('2d', {alpha:false});} catch (_) {return;}
  if (!ctx) return; // Keep the original solid backgrounds if graphics are unavailable.
  canvas.id = 'site-kinetic-background';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  document.body.classList.add('kinetic-background');

  const CELL_SIZE = 55, INFLUENCE_RADIUS = 260, MAX_WARP = 24;
  const DOT_SPACING = 28, LERP_SPEED = .08, TAU = Math.PI * 2;
  const themes = {
    dark: {bg:'#161618', base:[255,255,255,.13], node:[255,255,255,.2], active:[74,158,255,.9], nodeActive:[74,158,255,1], glow:'74,158,255', ripple:'100,180,255', dots:'rgba(255,255,255,.05)'},
    light: {bg:'#f8f9fc', base:[65,86,120,.13], node:[65,86,120,.2], active:[42,108,205,.8], nodeActive:[42,108,205,.95], glow:'42,108,205', ripple:'62,124,212', dots:'rgba(65,86,120,.07)'}
  };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const texture = document.createElement('canvas');
  const textureContext = texture.getContext('2d', {alpha:false});
  const mouse = {x:-9999, y:-9999}, target = {x:-9999, y:-9999};
  const ripples = [], listeners = [];
  let width = 0, height = 0, ratio = 1, cols = 0, rows = 0;
  let grid = new Float32Array(0), points = new Float32Array(0);
  let presence = 0, targetPresence = 0, frame = 0, lastTime = 0;
  let resizePending = true, textureDirty = true, pageHidden = false, disposed = false;
  let themeName = '', theme = themes.dark;
  const lerp = (a,b,t) => a + (b-a)*t;
  const smooth = t => t*t*(3-2*t);
  const color = (a,b,t) => `rgba(${Math.round(lerp(a[0],b[0],t))},${Math.round(lerp(a[1],b[1],t))},${Math.round(lerp(a[2],b[2],t))},${lerp(a[3],b[3],t).toFixed(3)})`;
  const listen = (node,type,callback,options) => {
    node.addEventListener(type,callback,options);
    listeners.push([node,type,callback,options]);
  };
  function paused() {
    return disposed || pageHidden || document.hidden || document.body.classList.contains('ei-intro-locked');
  }
  function wake() {
    if (!frame && !paused()) frame = requestAnimationFrame(animate);
  }
  function stop() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0; lastTime = 0;
  }
  function readTheme() {
    const name = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    if (name !== themeName) {themeName = name; theme = themes[name]; textureDirty = true;}
    canvas.dataset.theme = name;
  }
  function resize() {
    const bounds = canvas.getBoundingClientRect();
    width = Math.max(1,bounds.width || document.documentElement.clientWidth || innerWidth);
    height = Math.max(1,bounds.height || innerHeight);
    // Bound raster memory and point counts on high-DPI / very large displays.
    ratio = Math.min(devicePixelRatio || 1,2,Math.sqrt(3000000/(width*height)));
    canvas.width = Math.max(1,Math.floor(width*ratio));
    canvas.height = Math.max(1,Math.floor(height*ratio));
    ctx.setTransform(ratio,0,0,ratio,0,0);
    const cell = Math.max(CELL_SIZE,Math.sqrt(width*height/2200));
    cols = Math.max(2,Math.ceil(width/cell))+1;
    rows = Math.max(2,Math.ceil(height/cell))+1;
    grid = new Float32Array(cols*rows*3);
    points = new Float32Array(cols*rows*3);
    for (let row=0;row<rows;row++) for (let col=0;col<cols;col++) {
      const i = (row*cols+col)*3;
      const cp = Math.min(col/1.5,(cols-1-col)/1.5,1);
      const rp = Math.min(row/1.5,(rows-1-row)/1.5,1);
      grid[i] = col*width/(cols-1); grid[i+1] = row*height/(rows-1);
      grid[i+2] = cp*cp*rp*rp;
    }
    resizePending = false; textureDirty = true;
  }
  function paintTexture(context) {
    context.fillStyle = theme.bg; context.fillRect(0,0,width,height);
    context.fillStyle = theme.dots; context.beginPath();
    for (let x=DOT_SPACING/2;x<width;x+=DOT_SPACING) for (let y=DOT_SPACING/2;y<height;y+=DOT_SPACING) {
      context.moveTo(x+.7,y); context.arc(x,y,.7,0,TAU);
    }
    context.fill();
  }
  function background() {
    if (!textureContext) {paintTexture(ctx); return;}
    if (textureDirty) {
      texture.width = canvas.width; texture.height = canvas.height;
      textureContext.setTransform(ratio,0,0,ratio,0,0);
      paintTexture(textureContext); textureDirty = false;
    }
    ctx.drawImage(texture,0,0,width,height);
  }
  function draw(now) {
    background();
    for (let i=ripples.length-1;i>=0;i--) {
      const r = ripples[i], age = Math.max(0,(now-r.born)/1000);
      r.radius = age*400; r.opacity = Math.max(0,1-age*1.2);
      if (!r.opacity) ripples.splice(i,1);
    }
    for (let i=0;i<grid.length;i+=3) {
      const gx=grid[i], gy=grid[i+1], pin=grid[i+2];
      const dx=gx-mouse.x, dy=gy-mouse.y, distance=Math.hypot(dx,dy);
      let x=gx, y=gy;
      for (const r of ripples) {
        const rx=gx-r.x, ry=gy-r.y, rd=Math.hypot(rx,ry), diff=rd-r.radius;
        if (rd>0 && Math.abs(diff)<55) {
          const strength=(1-Math.abs(diff)/55)*r.opacity*18*pin*(diff<0?1:-1);
          x+=rx/rd*strength; y+=ry/rd*strength;
        }
      }
      if (distance>0 && distance<INFLUENCE_RADIUS && pin>0) {
        const t=distance/INFLUENCE_RADIUS;
        const bell=t<.01?0:(1-t)*(1-t)*Math.min(1,distance/60);
        const amount=bell*MAX_WARP*pin*presence;
        x-=dx/distance*amount; y-=dy/distance*amount;
      }
      points[i]=x; points[i+1]=y;
      points[i+2]=Math.max(0,1-distance/INFLUENCE_RADIUS)*pin*presence;
    }
    // Batch inactive segments; active segments retain the supplied smooth gradient.
    const segment = (a,b,active) => {
      const t=smooth((points[a+2]+points[b+2])*.5);
      if ((t>.002)!==active) return;
      if (active) ctx.beginPath();
      ctx.moveTo(points[a],points[a+1]); ctx.lineTo(points[b],points[b+1]);
      if (active) {ctx.strokeStyle=color(theme.base,theme.active,t);ctx.lineWidth=lerp(.8,1.5,t);ctx.stroke();}
    };
    ctx.lineCap='butt';
    for (const active of [false,true]) {
      if (!active) {ctx.beginPath();ctx.strokeStyle=color(theme.base,theme.base,0);ctx.lineWidth=.8;}
      for (let row=0;row<rows;row++) for (let col=0;col<cols;col++) {
        const i=(row*cols+col)*3;
        if (col<cols-1) segment(i,i+3,active);
        if (row<rows-1) segment(i,i+cols*3,active);
      }
      if (!active) ctx.stroke();
    }
    ctx.beginPath();ctx.fillStyle=color(theme.node,theme.node,0);
    for (let i=0;i<points.length;i+=3) if (points[i+2]<=.002) {
      ctx.moveTo(points[i]+1.8,points[i+1]);ctx.arc(points[i],points[i+1],1.8,0,TAU);
    }
    ctx.fill();
    for (let i=0;i<points.length;i+=3) {
      if (points[i+2]<=.002) continue;
      const x=points[i],y=points[i+1],t=smooth(points[i+2]),r=lerp(1.8,3.2,t);
      if (t>.3) {
        const glowR=r+6*(t-.3)/.7;
        const gradient=ctx.createRadialGradient(x,y,r*.5,x,y,glowR);
        gradient.addColorStop(0,`rgba(${theme.glow},${(t*.3).toFixed(3)})`);
        gradient.addColorStop(1,`rgba(${theme.glow},0)`);
        ctx.fillStyle=gradient;ctx.beginPath();ctx.arc(x,y,glowR,0,TAU);ctx.fill();
      }
      ctx.fillStyle=color(theme.node,theme.nodeActive,t);ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();
    }
    for (const r of ripples) {
      ctx.beginPath();ctx.arc(r.x,r.y,Math.max(0,r.radius),0,TAU);
      ctx.strokeStyle=`rgba(${theme.ripple},${(r.opacity*.28).toFixed(3)})`;ctx.lineWidth=1.5;ctx.stroke();
    }
  }
  function animate(now) {
    frame=0;
    if (paused()) {lastTime=0;return;}
    if (resizePending) resize();
    readTheme();
    const dt=lastTime?Math.min(50,Math.max(1,now-lastTime)):1000/60;
    const blend=1-Math.pow(1-LERP_SPEED,dt/(1000/60));
    lastTime=now;
    if (reduced.matches) {presence=0;ripples.length=0;}
    else {
      mouse.x=lerp(mouse.x,target.x,blend);mouse.y=lerp(mouse.y,target.y,blend);
      presence=lerp(presence,targetPresence,blend);
      if (Math.abs(presence-targetPresence)<.001) presence=targetPresence;
      if (Math.abs(mouse.x-target.x)<.05) mouse.x=target.x;
      if (Math.abs(mouse.y-target.y)<.05) mouse.y=target.y;
    }
    draw(now);
    const moving=presence!==targetPresence || (targetPresence && (mouse.x!==target.x || mouse.y!==target.y));
    if (!reduced.matches && (moving || ripples.length)) wake();
    else lastTime=0;
  }
  function leave() {targetPresence=0;wake();}
  function resetPointer() {presence=targetPresence=0;ripples.length=0;lastTime=0;}
  listen(window,'pointermove',event => {
    if (reduced.matches || paused() || event.pointerType==='touch') return;
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
    if (!targetPresence && !presence) {mouse.x=event.clientX;mouse.y=event.clientY;}
    target.x=event.clientX;target.y=event.clientY;targetPresence=1;wake();
  },{passive:true});
  listen(window,'pointerout',event => {if (!event.relatedTarget) leave();},{passive:true});
  listen(window,'blur',leave);
  listen(window,'click',event => {
    if (reduced.matches || paused() || event.defaultPrevented || event.detail===0) return;
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
    if (ripples.length>=8) ripples.shift();
    ripples.push({x:event.clientX,y:event.clientY,radius:0,opacity:1,born:performance.now()});wake();
  },{passive:true});
  const requestResize=() => {resizePending=true;wake();};
  listen(window,'resize',requestResize,{passive:true});
  if (window.visualViewport) listen(window.visualViewport,'resize',requestResize,{passive:true});
  listen(window,'site-theme-change',() => {readTheme();wake();});
  listen(reduced,'change',() => {resetPointer();wake();});
  listen(document,'visibilitychange',() => {
    resetPointer();if (document.hidden) stop();else wake();
  });
  listen(window,'pageshow',() => {pageHidden=false;resetPointer();requestResize();});
  listen(window,'pagehide',event => {
    pageHidden=true;stop();
    if (!event.persisted) {
      disposed=true;
      for (const [node,type,handler,options] of listeners) node.removeEventListener(type,handler,options);
      observer.disconnect();
    }
  });
  const observer=new MutationObserver(() => {if (paused()) stop();else wake();});
  observer.observe(document.body,{attributes:true,attributeFilter:['class']});
  readTheme();resize();draw(performance.now());wake();
})();
