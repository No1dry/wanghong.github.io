/* Native enhancement of the existing controls; no replacement click handlers.
 * Paper Shaders 0.0.81 is vendored locally under its Apache-2.0 license.
 */
const buttons = [...document.querySelectorAll('.liquid-metal-button')];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const records = new Map();
let paperPromise;

function paper() {
  return paperPromise ||= Promise.all([
    import('../vendor/paper-shaders/shader-mount.js'),
    import('../vendor/paper-shaders/shaders/liquid-metal.js'),
  ]).then(([mount, shader]) => ({...mount, ...shader}));
}

function speed(record) {
  return reducedMotion.matches || document.hidden || !record.visible || record.button.disabled
    ? 0 : record.burst ? 2.4 : record.hovered ? 1 : .6;
}

function syncSpeed(record) {
  record.mount?.setSpeed(speed(record));
}

async function mount(record) {
  if (record.mount || record.loading || record.failed || !record.visible || !record.button.isConnected) return;
  record.loading = true;
  try {
    const {ShaderMount, liquidMetalFragmentShader} = await paper();
    if (!record.button.isConnected || !record.visible) return;
    record.button.prepend(record.surface);
    record.mount = new ShaderMount(record.surface, liquidMetalFragmentShader, {
      u_repetition:4, u_softness:.5, u_shiftRed:.3, u_shiftBlue:.3,
      u_distortion:0, u_contour:0, u_angle:45, u_scale:8, u_shape:1,
      u_offsetX:.1, u_offsetY:-.1,
      // Explicit defaults required by the current Paper vertex shader.
      u_originX:.5, u_originY:.5, u_worldWidth:0, u_worldHeight:0,
      u_fit:2, u_rotation:0, u_imageAspectRatio:1, u_isImage:false,
      u_colorBack:[.08,.08,.09,1], u_colorTint:[1,1,1,1],
    }, {alpha:false, antialias:false, powerPreference:'low-power'}, speed(record), 1200, 1.5, 180000);
    record.mount.canvasElement.setAttribute('aria-hidden', 'true');
    // A lost GPU context gracefully falls back to the CSS metal rim.
    record.mount.canvasElement.addEventListener('webglcontextlost', () => {
      record.failed = true;
      record.mount?.dispose();
      record.mount = null;
      record.surface.remove();
    }, {once:true});
  } catch (_) {
    // The original action remains usable if WebGL or module loading is unavailable.
    record.failed = true;
    record.mount?.dispose();
    record.mount = null;
    record.surface.remove();
  } finally {
    record.loading = false;
  }
}

function decorate(record) {
  // The homepage's translated HTML replaces its children. Reattach the SAME
  // decoration after translation, retaining the native button and GPU context.
  if (record.mount && record.surface.parentElement !== record.button) record.button.prepend(record.surface);
}

function dispose(record) {
  clearTimeout(record.timer);
  record.mount?.dispose();
  record.mount = null;
  record.surface.remove();
  record.observer.disconnect();
  visibility?.unobserve(record.button);
  record.events.abort();
  records.delete(record.button);
  if (!records.size) detachObserver.disconnect();
}

const visibility = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  for (const entry of entries) {
    const record = records.get(entry.target);
    if (!record) continue;
    record.visible = entry.isIntersecting;
    syncSpeed(record);
    if (record.visible) mount(record);
  }
}) : null;

// Only child removals need checking; we do not observe continuous canvas/style updates.
const detachObserver = new MutationObserver(changes => {
  if (!changes.some(change => change.removedNodes.length)) return;
  for (const record of records.values()) if (!record.button.isConnected) dispose(record);
});

for (const button of buttons) {
  const surface = document.createElement('i');
  surface.className = 'liquid-metal-surface';
  surface.setAttribute('aria-hidden', 'true');
  const events = new AbortController();
  const record = {button, surface, events, mount:null, visible:!visibility, loading:false,
    failed:false, hovered:false, burst:false, timer:0, observer:null};
  records.set(button, record);
  const listen = (type, listener, options = {}) => button.addEventListener(type, listener, {...options, signal:events.signal});
  listen('pointerenter', event => {
    record.hovered = event.pointerType !== 'touch';
    syncSpeed(record);
  });
  listen('pointerleave', () => {record.hovered = false; syncSpeed(record);});
  listen('pointercancel', () => {record.hovered = false; syncSpeed(record);});
  listen('click', event => {
    if (button.disabled || reducedMotion.matches) return;
    // Visual feedback only: do not cancel navigation, submission or the mailto.
    record.burst = true;
    syncSpeed(record);
    clearTimeout(record.timer);
    record.timer = setTimeout(() => {record.burst = false; syncSpeed(record);}, 300);
    const rect = button.getBoundingClientRect();
    const ripple = document.createElement('i');
    ripple.className = 'liquid-metal-ripple';
    ripple.setAttribute('aria-hidden', 'true');
    ripple.style.left = `${event.detail ? event.clientX - rect.left : rect.width / 2}px`;
    ripple.style.top = `${event.detail ? event.clientY - rect.top : rect.height / 2}px`;
    // Cap decoration count when the user clicks rapidly.
    const oldRipples = button.querySelectorAll('.liquid-metal-ripple');
    if (oldRipples.length >= 4) oldRipples[0].remove();
    button.append(ripple);
    setTimeout(() => ripple.remove(), 650);
  }, {capture:true}); // Run feedback before the existing flow temporarily disables Continue.
  record.observer = new MutationObserver(() => {decorate(record); syncSpeed(record);});
  record.observer.observe(button, {childList:true, attributes:true, attributeFilter:['disabled']});
  if (visibility) visibility.observe(button);
  else mount(record);
}
if (records.size) detachObserver.observe(document.body, {childList:true, subtree:true});

function refresh() {
  for (const record of records.values()) {
    if (!record.button.isConnected) dispose(record);
    else {decorate(record); syncSpeed(record);}
  }
}
reducedMotion.addEventListener('change', refresh);
document.addEventListener('visibilitychange', refresh);
window.addEventListener('site-language-change', refresh);
window.addEventListener('pagehide', event => {
  if (!event.persisted) for (const record of [...records.values()]) dispose(record);
});
window.addEventListener('pageshow', refresh);
