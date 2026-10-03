/* Native adaptation of the supplied React Bits ElectricBorder (Canvas variant).
   Original effect inspired by @BalintFerenczy:
   https://codepen.io/BalintFerenczy/pen/KwdoyEN
   The timeline remains the sole owner of selection and scrolling. */
(() => {
  'use strict';
  const viewport = document.getElementById('timelineViewport');
  const track = document.getElementById('timelineTrack');
  const panel = viewport?.parentElement;
  if (!panel || !track || panel.querySelector('.nt-electric-layer')) return;

  const layer = document.createElement('div');
  layer.className = 'nt-electric-layer';
  layer.setAttribute('aria-hidden', 'true');
  layer.hidden = true;
  layer.innerHTML = '<div class="nt-electric-border"><div class="eb-canvas-container"><canvas class="eb-canvas"></canvas></div><div class="eb-layers"><div class="eb-glow-1"></div><div class="eb-glow-2"></div><div class="eb-background-glow"></div></div></div>';
  panel.append(layer);
  const border = layer.firstElementChild;
  const canvas = layer.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {layer.remove(); return;}
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const events = new AbortController();
  const padding = 60, chaos = .12, speed = 1;
  let selected = null, copy = null, raf = 0, time = 0, lastFrame = 0;
  let width = 0, height = 0, radius = 6, dpr = 0, points = [];
  let dirty = true, colorDirty = true, color = '#7df9ff';
  let visible = false, suspended = false, destroyed = false;

  const random = x => (Math.sin(x * 12.9898) * 43758.5453) % 1;
  function noise2D(x, y) {
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = random(i + j * 57), b = random(i + 1 + j * 57);
    const c = random(i + (j + 1) * 57), d = random(i + 1 + (j + 1) * 57);
    return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy;
  }
  function octavedNoise(x, seed) {
    let result = 0, amplitude = chaos, frequency = 10;
    for (let i = 0; i < 10; i++) {
      // The source's baseFlatness=0 makes the first octave contribute nothing.
      if (i) result += amplitude * noise2D(frequency * x + seed * 100, time * frequency * .3);
      frequency *= 1.6;
      amplitude *= .7;
    }
    return result;
  }
  function roundedPoint(t, w, h, r) {
    const straightW = w - 2 * r, straightH = h - 2 * r, arc = Math.PI * r / 2;
    let distance = t * (2 * straightW + 2 * straightH + 4 * arc);
    const segments = [straightW, arc, straightH, arc, straightW, arc, straightH, arc];
    for (let i = 0; i < segments.length; i++) {
      const length = segments[i];
      if (distance <= length || i === 7) {
        const p = length ? Math.min(1, distance / length) : 0;
        if (i === 0) return {x:r + p * straightW, y:0};
        if (i === 2) return {x:w, y:r + p * straightH};
        if (i === 4) return {x:w - r - p * straightW, y:h};
        if (i === 6) return {x:0, y:h - r - p * straightH};
        const corner = (i - 1) / 2, angle = (corner - 1) * Math.PI / 2 + p * Math.PI / 2;
        return {x:(corner < 2 ? w - r : r) + r * Math.cos(angle),
          y:(corner === 0 || corner === 3 ? r : h - r) + r * Math.sin(angle)};
      }
      distance -= length;
    }
  }
  function stop() {cancelAnimationFrame(raf); raf = 0; lastFrame = 0;}
  function requestMeasure() {
    dirty = true;
    if (!raf && !destroyed && !suspended && !document.hidden) raf = requestAnimationFrame(render);
  }
  function updateSelection() {
    const next = [...track.querySelectorAll('.nt-item.active')].find(item => !item.hidden && !item.closest('[hidden]')) || null;
    if (next !== selected) {
      copyObserver?.disconnect();
      selected = next;
      copy = next?.querySelector('.nt-copy') || null;
      if (copy) copyObserver?.observe(copy);
      // Never leave the previous card lit while a filter or scroll selects another.
      layer.hidden = true;
      requestMeasure();
    }
  }
  function measure() {
    dirty = false;
    if (!copy || !selected || selected.hidden || selected.closest('[hidden]')) {
      visible = false; layer.hidden = true; return;
    }
    const v = viewport.getBoundingClientRect(), c = copy.getBoundingClientRect();
    const scaleX = viewport.offsetWidth / (v.width || 1), scaleY = viewport.offsetHeight / (v.height || 1);
    const left = (c.left - v.left) * scaleX - viewport.clientLeft;
    const top = (c.top - v.top) * scaleY - viewport.clientTop;
    const w = c.width * scaleX, h = c.height * scaleY;
    visible = w > 0 && h > 0 && top + h > 0 && top < viewport.clientHeight && v.bottom > 0 && v.top < innerHeight;
    layer.hidden = !visible;
    if (!visible) return;
    Object.assign(layer.style, {left:`${viewport.offsetLeft + viewport.clientLeft}px`, top:`${viewport.offsetTop + viewport.clientTop}px`,
      width:`${viewport.clientWidth}px`, height:`${viewport.clientHeight}px`});
    Object.assign(border.style, {left:`${left}px`, top:`${top}px`, width:`${w}px`, height:`${h}px`});
    const nextRadius = Math.min(parseFloat(getComputedStyle(copy).borderTopLeftRadius) || 0, w / 2, h / 2);
    const nextDpr = Math.min(devicePixelRatio || 1, 2, Math.sqrt(1800000 / ((w + padding * 2) * (h + padding * 2))));
    if (w !== width || h !== height || nextRadius !== radius || nextDpr !== dpr) {
      width = w; height = h; radius = nextRadius; dpr = nextDpr;
      border.style.borderRadius = `${radius}px`;
      canvas.width = Math.round((w + padding * 2) * dpr);
      canvas.height = Math.round((h + padding * 2) * dpr);
      canvas.style.width = `${w + padding * 2}px`;
      canvas.style.height = `${h + padding * 2}px`;
      const perimeter = 2 * (w + h - 4 * radius) + 2 * Math.PI * radius;
      const count = Math.max(32, Math.min(1800, Math.ceil(perimeter / 2)));
      points = Array.from({length:count}, (_, i) => ({...roundedPoint(i / count, w, h, radius), progress:i / count}));
    }
  }
  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.35;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    points.forEach((point, index) => {
      const x = padding + point.x + octavedNoise(point.progress * 8, 0) * 60;
      const y = padding + point.y + octavedNoise(point.progress * 8, 1) * 60;
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
  }
  function render(now) {
    raf = 0;
    if (destroyed || suspended || document.hidden) {lastFrame = 0; return;}
    if (dirty) measure();
    if (!visible) {lastFrame = 0; return;}
    if (colorDirty) {color = getComputedStyle(border).getPropertyValue('--electric-border-color').trim() || '#7df9ff'; colorDirty = false;}
    if (reduced.matches) {lastFrame = 0; return;}
    time += lastFrame ? Math.min(.05, (now - lastFrame) / 1000) * speed : 0;
    lastFrame = now;
    draw();
    raf = requestAnimationFrame(render);
  }
  function dispose() {
    destroyed = true; stop(); events.abort();
    selectionObserver.disconnect(); layoutObserver?.disconnect(); copyObserver?.disconnect();
    layer.remove();
  }
  const listen = (target, type, handler) => target.addEventListener(type, handler, {passive:true, signal:events.signal});
  const copyObserver = 'ResizeObserver' in window ? new ResizeObserver(requestMeasure) : null;
  const layoutObserver = 'ResizeObserver' in window ? new ResizeObserver(requestMeasure) : null;
  layoutObserver?.observe(viewport);
  layoutObserver?.observe(track);
  const selectionObserver = new MutationObserver(updateSelection);
  selectionObserver.observe(track, {subtree:true, attributes:true, attributeFilter:['class', 'hidden']});
  listen(viewport, 'scroll', requestMeasure);
  listen(window, 'resize', requestMeasure);
  listen(window, 'site-language-change', requestMeasure);
  listen(window, 'site-theme-change', () => {colorDirty = true; requestMeasure();});
  listen(reduced, 'change', () => {stop(); requestMeasure();});
  listen(document, 'visibilitychange', () => {if (document.hidden) stop(); else requestMeasure();});
  listen(window, 'pagehide', event => {if (event.persisted) {suspended = true; stop();} else dispose();});
  listen(window, 'pageshow', () => {suspended = false; requestMeasure();});
  if (document.fonts) document.fonts.ready.then(() => {if (!destroyed) requestMeasure();});
  updateSelection();
})();
