/* SVG media-filled type and pointer/idle motion adapted from the supplied
 * React Bits MaskedHeading. Native DOM integration keeps this static site intact.
 * Only #ei-welcome-title is enhanced; the cinematic owns its own lifecycle.
 */
(() => {
  'use strict';
  const root = document.getElementById('ei-welcome-title');
  const intro = document.getElementById('ei-intro');
  if (!root || !intro || !window.CSS?.supports('clip-path', 'url(#ei-heading-clip)')) return;

  const settings = {fillScale:1.25, parallax:26, drift:18, brightness:1.12, saturation:1.08, duration:1.1};
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const svgNS = 'http://www.w3.org/2000/svg';
  const lines = [...root.children].filter(node => node.tagName === 'SPAN');
  const glyphs = [], baselines = [];
  const offset = {x:0, y:0, tx:0, ty:0};
  const events = new AbortController();
  let disposed = false, ready = false, active = false, suspended = false;
  let frameId = 0, layoutId = 0, lastTime = 0, clock = 0, tween = null;
  let lastCopy = '', width = 0, height = 0;

  root.classList.add('masked-heading');
  const defs = document.createElementNS(svgNS, 'svg');
  defs.classList.add('masked-heading__defs');
  defs.setAttribute('aria-hidden', 'true');
  defs.setAttribute('focusable', 'false');
  const definitions = document.createElementNS(svgNS, 'defs');
  const clipPath = document.createElementNS(svgNS, 'clipPath');
  clipPath.id = 'ei-heading-clip';
  clipPath.setAttribute('clipPathUnits', 'userSpaceOnUse');
  definitions.append(clipPath);
  defs.append(definitions);
  const layer = document.createElement('span');
  layer.className = 'masked-heading__reveal';
  layer.setAttribute('aria-hidden', 'true');
  const clip = document.createElement('span');
  clip.className = 'masked-heading__clip';
  clip.style.clipPath = 'url(#ei-heading-clip)';
  const media = document.createElement('span');
  media.className = 'masked-heading__media';
  const image = new Image();
  image.className = 'masked-heading__source';
  image.alt = '';
  image.draggable = false;
  image.decoding = 'async';
  media.append(image);
  clip.append(media);
  layer.append(clip);
  root.append(defs, layer);

  for (const line of lines) {
    line.classList.add('masked-heading__line');
    const baseline = document.createElement('i');
    baseline.className = 'masked-heading__baseline';
    baseline.setAttribute('aria-hidden', 'true');
    baselines.push(baseline);
    const glyph = document.createElementNS(svgNS, 'text');
    glyph.setAttribute('text-anchor', 'middle');
    glyphs.push(glyph);
    clipPath.append(glyph);
  }

  function place() {
    const maxX = (settings.fillScale - 1) * width / 2;
    const maxY = (settings.fillScale - 1) * height / 2;
    media.style.transform = `translate3d(${clamp(offset.x,-maxX,maxX).toFixed(2)}px,${clamp(offset.y,-maxY,maxY).toFixed(2)}px,0) scale(${settings.fillScale})`;
    media.style.filter = `brightness(${settings.brightness}) saturate(${settings.saturation})`;
  }

  function sync() {
    if (disposed || !root.isConnected) return;
    width = root.clientWidth;
    height = root.clientHeight;
    if (!width || !height) return;
    lines.forEach((line, i) => {
      // Language switching replaces the translated line's textContent.
      if (baselines[i].parentElement !== line) line.append(baselines[i]);
      const cs = getComputedStyle(line);
      const glyph = glyphs[i];
      glyph.textContent = line.textContent;
      glyph.setAttribute('x', String(line.offsetLeft + line.clientWidth / 2));
      glyph.setAttribute('y', String(line.offsetTop + baselines[i].offsetTop));
      for (const name of ['fontFamily','fontSize','fontWeight','fontStyle','letterSpacing','fontKerning','fontFeatureSettings']) glyph.style[name] = cs[name];
    });
    place();
  }

  function queueLayout() {
    if (!disposed && !layoutId) layoutId = requestAnimationFrame(() => {layoutId = 0; sync();});
  }

  function tick(now) {
    frameId = 0;
    if (disposed || !active || !ready || document.hidden || suspended || reduce.matches) return;
    const dt = lastTime ? Math.min(.05, (now - lastTime) / 1000) : 0;
    lastTime = now;
    clock += dt;
    const ease = 1 - Math.exp(-dt / .18);
    offset.x += (offset.tx + Math.sin(clock * .21) * settings.drift - offset.x) * ease;
    offset.y += (offset.ty + Math.cos(clock * .17) * settings.drift * .6 - offset.y) * ease;
    place();
    frameId = requestAnimationFrame(tick);
  }

  function stop() {
    cancelAnimationFrame(frameId);
    frameId = 0;
    lastTime = 0;
  }

  function run() {
    if (!disposed && ready && active && !reduce.matches && !document.hidden && !suspended && !frameId) frameId = requestAnimationFrame(tick);
  }

  function reveal() {
    if (!ready || disposed) return;
    sync();
    tween?.kill();
    if (reduce.matches || !window.gsap) layer.style.clipPath = 'inset(0% 0% 0% 0%)';
    else {
      const state = {p:100};
      layer.style.clipPath = 'inset(0% 100% 0% 0%)';
      tween = gsap.to(state, {
        p:0, duration:settings.duration, ease:'power3.inOut',
        onUpdate:() => {layer.style.clipPath = `inset(0% ${state.p}% 0% 0%)`;},
      });
      if (document.hidden || suspended) tween.pause();
    }
    run();
  }

  function updateState() {
    if (disposed) return;
    if (!intro.isConnected || intro.dataset.state === 'leaving') {dispose(); return;}
    const arrived = intro.dataset.state === 'welcome';
    if (arrived === active) return;
    active = arrived;
    if (active) reveal();
    else {
      stop();
      tween?.kill();
      tween = null;
      offset.x = offset.y = offset.tx = offset.ty = clock = 0;
      place();
      layer.style.clipPath = 'inset(0% 100% 0% 0%)';
    }
  }

  function translate() {
    const copy = lines.map(line => line.textContent).join('\n');
    if (copy === lastCopy) return;
    lastCopy = copy;
    sync();
  }

  function visibility() {
    if (document.hidden || suspended) {stop(); tween?.pause();}
    else {tween?.resume(); run();}
  }

  function motionPreference() {
    stop();
    if (reduce.matches) {
      tween?.kill();
      tween = null;
      offset.x = offset.y = offset.tx = offset.ty = 0;
      place();
      if (active) layer.style.clipPath = 'inset(0% 0% 0% 0%)';
    } else run();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    stop();
    cancelAnimationFrame(layoutId);
    tween?.kill();
    observer.disconnect();
    sizeObserver?.disconnect();
    events.abort();
    // Keep the final visual during the original 900ms fade to the homepage.
    media.style.willChange = 'auto';
  }

  const observer = new MutationObserver(updateState);
  observer.observe(intro, {attributes:true, attributeFilter:['data-state']});
  const sizeObserver = 'ResizeObserver' in window ? new ResizeObserver(queueLayout) : null;
  sizeObserver?.observe(root);
  const listen = (target, type, fn, options = {}) => target.addEventListener(type, fn, {...options, signal:events.signal});
  listen(root, 'pointermove', event => {
    if (reduce.matches || event.pointerType === 'touch' || !active) return;
    const rect = root.getBoundingClientRect();
    offset.tx = -clamp((event.clientX - rect.left) / (rect.width || 1) * 2 - 1, -1, 1) * settings.parallax;
    offset.ty = -clamp((event.clientY - rect.top) / (rect.height || 1) * 2 - 1, -1, 1) * settings.parallax;
  }, {passive:true});
  listen(root, 'pointerleave', () => {offset.tx = offset.ty = 0;}, {passive:true});
  listen(root, 'pointercancel', () => {offset.tx = offset.ty = 0;}, {passive:true});
  listen(window, 'resize', queueLayout, {passive:true});
  listen(window, 'site-language-change', translate);
  listen(document, 'visibilitychange', visibility);
  listen(reduce, 'change', motionPreference);
  listen(window, 'pagehide', event => {
    if (!event.persisted) dispose();
    else {suspended = true; visibility();}
  });
  listen(window, 'pageshow', () => {suspended = false; updateState(); visibility(); queueLayout();});
  image.addEventListener('load', async () => {
    try {await image.decode();} catch (_) {return;}
    if (disposed) return;
    ready = true;
    sync();
    root.classList.add('masked-heading--ready');
    if (active) reveal();
  }, {once:true, signal:events.signal});
  image.addEventListener('error', () => {root.classList.remove('masked-heading--ready');}, {once:true, signal:events.signal});
  image.src = 'assets/images/welcome-cosmic-fill.svg';
  document.fonts?.ready.then(() => {if (!disposed) sync();}).catch(() => {});
  translate();
  updateState();
})();
