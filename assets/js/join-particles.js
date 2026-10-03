/* Join Us: the publication sphere, then the same particles assemble the question. */
(() => {
  'use strict';
  const intro = document.getElementById('joinIntro');
  let canvas = document.getElementById('joinParticles');
  const question = document.getElementById('joinQuestion');
  const hint = document.getElementById('joinParticleHint');
  if (!intro || !canvas || !question) {
    window.EIJoinParticles = {morph: () => Promise.resolve(), setActive() {}, dispose() {}};
    return;
  }

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = matchMedia('(pointer: coarse)');
  const language = () => window.EILanguage?.current || 'en';
  const t = (key, vars = {}) => {
    const id = 'join.' + key;
    const fallback = window.EITranslations?.[id]?.[language()] || window.EITranslations?.[id]?.en || id;
    return (window.EILanguage?.t(id,vars,fallback) ?? fallback).replace(/\{(\w+)\}/g,(match,name)=>vars[name] ?? match);
  };
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const smooth = value => {const t = clamp(value, 0, 1); return t * t * (3 - 2 * t);};
  const random = n => {const value = Math.sin(n * 127.1 + 311.7) * 43758.5453; return value - Math.floor(value);};
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const duration = 1750;
  const count = innerWidth <= 640 ? 2800 : 5200;
  // home.xyz, scatter.xyz, text.xy, seed: one immutable sphere and one text target per particle.
  const vertices = new Float32Array(count * 9);
  const projected = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const j = i * 9, y = 1 - 2 * (i + .5) / count;
    const ring = Math.sqrt(1 - y * y), theta = i * goldenAngle;
    const x = Math.cos(theta) * ring, z = Math.sin(theta) * ring;
    const distance = .65 + random(i + 1) * 1.8;
    vertices[j] = x; vertices[j + 1] = y; vertices[j + 2] = z;
    vertices[j + 3] = x * distance + (random(i + 13) - .5) * 1.3;
    vertices[j + 4] = y * distance + (random(i + 29) - .5) * 1.3;
    vertices[j + 5] = z * distance + (random(i + 47) - .5) * 1.3;
    vertices[j + 8] = random(i + 71);
  }

  let gl = null, context = null, program = null, buffer = null, uniforms = null;
  let width = 0, height = 0, dpr = 1, radius = 1;
  let ink = '#f4f2ef', inkRGB = [244 / 255, 242 / 255, 239 / 255];
  let frameID = 0, lastTime = 0, resizeID = 0, finishTimer = 0;
  let active = true, visible = true, disposed = false, ready = false, textReady = false;
  let state = 'sphere', progress = 0, morphBirth = 0, morphFrom = 0;
  let morphPromise = null, resolveMorph = null;
  let spread = 0, spreadTarget = 0, yaw = 0, yawTarget = 0, pitch = -.12, pitchTarget = -.12;
  let touch = null;
  const listeners = [];

  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    listeners.push([target, type, handler, options]);
  }
  function shader(type, source) {
    const value = gl.createShader(type);
    gl.shaderSource(value, source); gl.compileShader(value);
    if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) {
      gl.deleteShader(value); throw new Error('Particle shader unavailable');
    }
    return value;
  }
  function releaseGL() {
    if (!gl) return;
    if (buffer) gl.deleteBuffer(buffer);
    if (program) gl.deleteProgram(program);
    buffer = null; program = null;
  }
  function useCanvas() {
    if (gl) {
      releaseGL();
      const replacement = canvas.cloneNode(true);
      canvas.replaceWith(replacement); canvas = replacement;
    }
    gl = null;
    try {context = canvas.getContext('2d', {alpha:true});} catch (_) {context = null;}
  }
  try {
    gl = canvas.getContext('webgl', {alpha:true, antialias:false, depth:false, stencil:false, powerPreference:'low-power'});
    if (!gl) throw new Error('Use Canvas renderer');
    const vertex = shader(gl.VERTEX_SHADER, `
      attribute vec3 a_home;
      attribute vec3 a_scatter;
      attribute vec2 a_text;
      attribute float a_seed;
      uniform vec2 u_view;
      uniform vec2 u_rotation;
      uniform float u_radius;
      uniform float u_spread;
      uniform float u_gather;
      uniform float u_dpr;
      varying float v_alpha;
      void main(){
        vec3 p=a_home+a_scatter*u_spread;
        float cx=cos(u_rotation.y),sx=sin(u_rotation.y),cy=cos(u_rotation.x),sy=sin(u_rotation.x);
        p=vec3(p.x,p.y*cx-p.z*sx,p.y*sx+p.z*cx);
        p=vec3(p.x*cy+p.z*sy,p.y,-p.x*sy+p.z*cy);
        float projection=7.0/(7.0-p.z);
        vec2 screen=mix(p.xy*u_radius*projection,a_text,u_gather);
        gl_Position=vec4(screen/(u_view*.5),0.0,1.0);
        gl_PointSize=mix((1.15+a_seed*.95)*projection,1.65+a_seed*.45,u_gather)*u_dpr;
        float depth=clamp((p.z/(1.0+u_spread*3.4)+1.0)*.5,0.0,1.0);
        v_alpha=mix((.12+.8*depth)*(.92+.08*a_seed),.96,u_gather);
      }
    `);
    const fragment = shader(gl.FRAGMENT_SHADER, `
      precision mediump float;
      uniform vec3 u_ink;
      varying float v_alpha;
      void main(){
        float edge=1.0-smoothstep(.45,1.0,length(gl_PointCoord*2.0-1.0));
        gl_FragColor=vec4(u_ink,edge*v_alpha);
      }
    `);
    program = gl.createProgram(); gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    gl.deleteShader(vertex); gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Particle program unavailable');
    gl.useProgram(program); buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
    [['a_home',3,0],['a_scatter',3,12],['a_text',2,24],['a_seed',1,32]].forEach(([name,size,offset]) => {
      const location = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, size, gl.FLOAT, false, 36, offset);
    });
    uniforms = {};
    ['view','rotation','radius','spread','gather','dpr','ink'].forEach(name => {uniforms[name] = gl.getUniformLocation(program, 'u_' + name);});
    gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.clearColor(0,0,0,0);
  } catch (_) {useCanvas();}

  function colors() {
    const computed = getComputedStyle(question).color;
    const values = computed.match(/[\d.]+/g);
    ink = computed || (document.documentElement.dataset.theme === 'light' ? '#1a1a2e' : '#f4f2ef');
    if (computed.startsWith('rgb') && values?.length >= 3) inkRGB = values.slice(0, 3).map(Number).map(value => value / 255);
    else inkRGB = document.documentElement.dataset.theme === 'light' ? [26 / 255, 26 / 255, 46 / 255] : [244 / 255, 242 / 255, 239 / 255];
  }
  function buildText() {
    if (!width || !height) return false;
    const mask = document.createElement('canvas');
    mask.width = Math.ceil(width); mask.height = Math.ceil(height);
    let pen;
    try {pen = mask.getContext('2d', {willReadFrequently:true});} catch (_) {return false;}
    if (!pen) return false;
    const phone = width <= 640;
    const chinese = language() === 'zh';
    const lines = chinese ? (phone ? ['想加入', '我们吗？'] : ['想加入我们吗？']) : (phone ? ['Do you', 'want to', 'join us?'] : ['Do you want', 'to join us?']);
    const style = getComputedStyle(question);
    const family = chinese ? '"Noto Serif SC", "Songti SC", "SimSun", serif' : style.fontFamily || '"Playfair Display", "Times New Roman", serif';
    let size = Math.min(phone ? 66 : 112, width * (phone ? .145 : .085), height * (phone ? .15 : .23));
    size = Math.max(12, size);
    const setFont = () => {pen.font = `400 ${size}px ${family}`;};
    setFont();
    while (size > 12 && Math.max(...lines.map(line => pen.measureText(line).width)) > width * .87) {size -= 1; setFont();}
    const leading = size * 1.16;
    pen.fillStyle = '#fff'; pen.textAlign = 'center'; pen.textBaseline = 'alphabetic';
    const firstCenter = height / 2 - (lines.length - 1) * leading / 2;
    lines.forEach((line, i) => {
      const metrics = pen.measureText(line);
      const ascent = metrics.actualBoundingBoxAscent || size * .75;
      const descent = metrics.actualBoundingBoxDescent || size * .2;
      pen.fillText(line, width / 2, firstCenter + i * leading + (ascent - descent) / 2);
    });
    let pixels;
    try {pixels = pen.getImageData(0,0,mask.width,mask.height).data;} catch (_) {return false;}
    const samples = [];
    // Sampling stays independent of device pixel ratio; no costly Retina-sized mask.
    for (let y = 1; y < mask.height; y += 1.6) {
      for (let x = 1; x < mask.width; x += 1.6) {
        if (pixels[(Math.floor(y) * mask.width + Math.floor(x)) * 4 + 3] > 110) samples.push(x - width / 2, height / 2 - y);
      }
    }
    const available = samples.length / 2;
    if (available < 20) return false;
    // Stratified coverage keeps every glyph populated even on the smaller phone budget.
    for (let i = 0; i < count; i++) {
      const sample = Math.min(available - 1, Math.floor((i + random(i + 103)) * available / count)) * 2;
      const j = i * 9;
      vertices[j + 6] = samples[sample] + (random(i + 211) - .5) * .5;
      vertices[j + 7] = samples[sample + 1] + (random(i + 223) - .5) * .5;
    }
    if (gl) {gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);}
    return true;
  }
  function canRun() {
    return !disposed && active && visible && !document.hidden && ready;
  }
  function stop() {cancelAnimationFrame(frameID); frameID = 0; lastTime = 0;}
  function wake() {
    if (canRun() && !frameID) frameID = requestAnimationFrame(tick);
  }
  function render() {
    if (disposed || !ready || !width || !height) return;
    const gathering = state === 'sphere' ? 0 : state === 'question' ? 1 : smooth((progress - .27) / .73);
    const expansion = state === 'sphere' ? spread : morphFrom + (1.18 - morphFrom) * smooth(progress / .32);
    if (gl) {
      gl.clear(gl.COLOR_BUFFER_BIT); gl.useProgram(program);
      gl.uniform2f(uniforms.view, width, height); gl.uniform2f(uniforms.rotation, yaw, pitch);
      gl.uniform1f(uniforms.radius, radius); gl.uniform1f(uniforms.spread, expansion);
      gl.uniform1f(uniforms.gather, gathering); gl.uniform1f(uniforms.dpr, dpr); gl.uniform3fv(uniforms.ink, inkRGB);
      gl.drawArrays(gl.POINTS, 0, count);
      return;
    }
    if (!context) return;
    context.setTransform(dpr,0,0,dpr,0,0); context.globalAlpha = 1;
    context.clearRect(0,0,width,height); context.fillStyle = ink;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch);
    for (let i = 0; i < count; i++) {
      const j = i * 9, k = i * 4;
      const x = vertices[j] + vertices[j + 3] * expansion;
      const y = vertices[j + 1] + vertices[j + 4] * expansion;
      const z = vertices[j + 2] + vertices[j + 5] * expansion;
      const py = y * cx - z * sx, pz = y * sx + z * cx;
      const rx = x * cy + pz * sy, rz = -x * sy + pz * cy, projection = 7 / (7 - rz);
      projected[k] = width / 2 + (rx * radius * projection) * (1 - gathering) + vertices[j + 6] * gathering;
      projected[k + 1] = height / 2 - ((py * radius * projection) * (1 - gathering) + vertices[j + 7] * gathering);
      projected[k + 2] = ((1.15 + vertices[j + 8] * .95) * projection * (1 - gathering) + (1.65 + vertices[j + 8] * .45) * gathering) / 2;
      const depth = clamp((rz / (1 + expansion * 3.4) + 1) * .5, 0, 1);
      projected[k + 3] = Math.round((depth * (1 - gathering) + gathering) * 7);
    }
    for (let bucket = 0; bucket < 8; bucket++) {
      context.globalAlpha = .12 + .84 * bucket / 7; context.beginPath();
      for (let i = 0; i < count; i++) {
        const k = i * 4;
        if (projected[k + 3] !== bucket) continue;
        const x = projected[k], y = projected[k + 1], r = projected[k + 2];
        if (x + r < 0 || x - r > width || y + r < 0 || y - r > height) continue;
        context.moveTo(x + r,y); context.arc(x,y,r,0,Math.PI * 2);
      }
      context.fill();
    }
    context.globalAlpha = 1;
  }
  function syncAccessibility() {
    const interactive = ready && active && !disposed && state === 'sphere';
    canvas.tabIndex = interactive ? 0 : -1;
    if (interactive) {
      canvas.removeAttribute('aria-hidden');
      canvas.setAttribute('role','slider');
      canvas.setAttribute('aria-label',t('particle.dispersion'));
      canvas.setAttribute('aria-valuemin','0'); canvas.setAttribute('aria-valuemax','100');
      const percent = Math.round(spreadTarget * 100);
      canvas.setAttribute('aria-valuenow',String(percent));
      canvas.setAttribute('aria-valuetext',percent ? t('particle.scattered',{percent}) : t('particle.gathered'));
      if (hint) canvas.setAttribute('aria-describedby',hint.id);
    } else {
      canvas.setAttribute('aria-hidden','true');
      ['role','aria-label','aria-valuemin','aria-valuemax','aria-valuenow','aria-valuetext','aria-describedby'].forEach(name => canvas.removeAttribute(name));
    }
  }
  function finishMorph() {
    if (state !== 'morphing') return;
    clearTimeout(finishTimer); finishTimer = 0;
    progress = 1; state = 'question'; intro.classList.add('is-question');
    // The persistent h1 carries the question's semantics; the settled canvas is decorative.
    syncAccessibility();
    if (hint) hint.textContent = t('hint.question');
    if (!textReady || !ready) {intro.classList.remove('particles-ready'); canvas.hidden = true;}
    else if (canRun()) render();
    stop();
    if (resolveMorph) {const resolve = resolveMorph; resolveMorph = null; resolve();}
  }
  function tick(now) {
    frameID = 0;
    if (!canRun()) {lastTime = 0; return;}
    const dt = lastTime ? Math.min(.05, Math.max(0, (now - lastTime) / 1000)) : 1 / 60;
    lastTime = now;
    if (state === 'morphing') {
      progress = clamp((now - morphBirth) / duration, 0, 1);
      if (progress >= 1) {finishMorph(); return;}
    } else if (state === 'sphere') {
      const easing = reduced.matches ? 1 : 1 - Math.exp(-dt * 8);
      const rotationEasing = reduced.matches ? 1 : 1 - Math.exp(-dt * 10);
      spread += (spreadTarget - spread) * easing;
      yaw += (yawTarget - yaw) * rotationEasing; pitch += (pitchTarget - pitch) * rotationEasing;
    }
    render();
    if (state === 'morphing' || (state === 'sphere' && Math.abs(spreadTarget - spread) + Math.abs(yawTarget - yaw) + Math.abs(pitchTarget - pitch) > .0002)) wake();
    else lastTime = 0;
  }
  function resize(forceText = false) {
    resizeID = 0;
    if (disposed) return;
    const bounds = canvas.getBoundingClientRect();
    const nextWidth = Math.round(bounds.width), nextHeight = Math.round(bounds.height);
    if (nextWidth < 2 || nextHeight < 2) return;
    const nextDpr = Math.min(devicePixelRatio || 1, nextWidth <= 640 ? 1.5 : 1.75, Math.sqrt(2200000 / (nextWidth * nextHeight)));
    if (!forceText && nextWidth === width && nextHeight === height && nextDpr === dpr) return;
    width = nextWidth; height = nextHeight; dpr = nextDpr;
    radius = Math.max(24, Math.min(270, width * .31, height * .32));
    canvas.width = Math.max(1, Math.round(width * dpr)); canvas.height = Math.max(1, Math.round(height * dpr));
    if (gl) gl.viewport(0,0,canvas.width,canvas.height);
    colors(); textReady = buildText(); ready = !!(gl || context);
    intro.classList.toggle('particles-ready', ready && (state !== 'question' || textReady));
    syncAccessibility();
    if (canRun()) render();
    wake();
  }
  function queueResize() {if (!disposed && !resizeID) resizeID = requestAnimationFrame(() => resize());}
  function isInteractive() {return canRun() && state === 'sphere';}
  function setSpread(value) {
    spreadTarget = clamp(value,0,1);
    const percent = Math.round(spreadTarget * 100);
    canvas.setAttribute('aria-valuenow', String(percent));
    canvas.setAttribute('aria-valuetext', percent ? t('particle.scattered',{percent}) : t('particle.gathered'));
    wake();
  }
  function wheel(event) {
    if (!isInteractive() || event.ctrlKey || event.target !== canvas) return;
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1);
    const next = clamp(spreadTarget + clamp(pixels,-200,200) * .0016,0,1);
    // At either end, scrolling continues normally to the rest of the page.
    if (Math.abs(next - spreadTarget) < .00001) return;
    if (event.cancelable) event.preventDefault();
    setSpread(next);
  }
  function pointerDown(event) {
    if (!isInteractive() || event.pointerType !== 'touch' || !event.isPrimary || event.target !== canvas) return;
    touch = {id:event.pointerId,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,captured:false};
  }
  function pointerMove(event) {
    if (!isInteractive() || event.target !== canvas) return;
    if (event.pointerType === 'touch') {
      if (!touch || event.pointerId !== touch.id) return;
      const dx = event.clientX - touch.startX, dy = event.clientY - touch.startY;
      if (!touch.captured) {
        if (Math.hypot(dx,dy) < 10) return;
        if (Math.abs(dy) > Math.abs(dx) * 1.15) {touch = null; return;}
        touch.captured = true; canvas.setPointerCapture(event.pointerId);
      }
      yawTarget += (event.clientX - touch.x) * .008;
      touch.x = event.clientX; touch.y = event.clientY;
    } else {
      const bounds = canvas.getBoundingClientRect();
      yawTarget = ((event.clientX - bounds.left) / width - .5) * Math.PI * 1.5;
      pitchTarget = -.12 + ((event.clientY - bounds.top) / height - .5) * 1.15;
    }
    wake();
  }
  function pointerEnd(event) {
    if (!touch || touch.id !== event.pointerId) return;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    touch = null;
  }
  function keydown(event) {
    if (!isInteractive() || event.target !== canvas) return;
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') setSpread(spreadTarget + .1);
    else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') setSpread(spreadTarget - .1);
    else if (event.key === 'Home') setSpread(0);
    else if (event.key === 'End') setSpread(1);
    else return;
    event.preventDefault();
  }
  function contextLost(event) {
    event.preventDefault();
    if (disposed) return;
    touch = null; useCanvas(); width = 0;
    if (!context) {ready = false; intro.classList.remove('particles-ready'); canvas.hidden = true; syncAccessibility(); if (state === 'morphing') finishMorph();}
    else {resize(true); wake();}
  }
  function refreshActivity() {if (canRun()) wake(); else stop();}
  listen(intro, 'wheel', wheel, {passive:false});
  listen(intro, 'pointerdown', pointerDown);
  listen(intro, 'pointermove', pointerMove, {passive:true});
  listen(intro, 'pointerup', pointerEnd); listen(intro, 'pointercancel', pointerEnd);
  listen(intro, 'keydown', keydown);
  listen(canvas, 'webglcontextlost', contextLost);
  listen(window, 'resize', queueResize, {passive:true});
  listen(window, 'site-theme-change', () => {colors(); if (canRun()) render();});
  listen(window, 'site-language-change', () => {
    resize(true);
    syncAccessibility();
    if (hint) hint.textContent = t(state === 'sphere' ? (coarse.matches ? 'hint.sphere.coarse' : 'hint.sphere') : state === 'morphing' ? 'hint.morph' : 'hint.question');
  });
  listen(document, 'visibilitychange', refreshActivity);
  listen(reduced, 'change', () => {if (reduced.matches && state === 'morphing') finishMorph(); else wake();});
  listen(window, 'pagehide', () => stop());
  listen(window, 'pageshow', () => {resize(); refreshActivity();});
  const intersection = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting; refreshActivity();
  }, {threshold:0}) : null;
  intersection?.observe(intro);
  const resizeObserver = 'ResizeObserver' in window ? new ResizeObserver(queueResize) : null;
  resizeObserver?.observe(intro);
  const mutations = new MutationObserver(refreshActivity);
  mutations.observe(document.body, {attributes:true,attributeFilter:['class']});
  syncAccessibility();
  if (hint) {
    hint.textContent = t(coarse.matches ? 'hint.sphere.coarse' : 'hint.sphere');
  }
  resize(true);
  if (document.fonts?.ready) document.fonts.ready.then(() => {if (!disposed) resize(true);}).catch(() => {});

  window.EIJoinParticles = {
    morph() {
      if (disposed || state === 'question') return Promise.resolve();
      if (morphPromise) return morphPromise;
      state = 'morphing'; progress = 0; morphBirth = performance.now(); morphFrom = spread;
      syncAccessibility();
      morphPromise = new Promise(resolve => {resolveMorph = resolve;});
      if (hint) hint.textContent = t('hint.morph');
      // A nonvisual completion path keeps the surrounding flow usable in every renderer.
      if (reduced.matches || !ready || !textReady) finishMorph();
      else {finishTimer = setTimeout(finishMorph,duration + 60); wake();}
      return morphPromise;
    },
    setActive(value) {
      active = !!value;
      syncAccessibility();
      if (!active) {stop(); touch = null;} else {resize(); wake();}
    },
    dispose() {
      if (disposed) return;
      if (state === 'morphing') finishMorph();
      disposed = true; syncAccessibility(); stop(); clearTimeout(finishTimer); cancelAnimationFrame(resizeID);
      listeners.forEach(([target,type,handler,options]) => target.removeEventListener(type,handler,options));
      intersection?.disconnect(); resizeObserver?.disconnect(); mutations.disconnect();
      if (touch && canvas.hasPointerCapture(touch.id)) canvas.releasePointerCapture(touch.id);
      touch = null; releaseGL();
    }
  };
})();
