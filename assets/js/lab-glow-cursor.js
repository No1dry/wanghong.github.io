/* React Bits GlowCursor: the supplied shader and trailing-point motion, adapted
 * to the static Lab hero. OGL 1.0.11 is served locally; no global pointer layer.
 */
import {Renderer} from '../vendor/ogl/core/Renderer.js';
import {Program} from '../vendor/ogl/core/Program.js';
import {Mesh} from '../vendor/ogl/core/Mesh.js';
import {Triangle} from '../vendor/ogl/extras/Triangle.js';

const MAX_POINTS = 64;
const VERTEX_SHADER = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}`;
const FRAGMENT_SHADER = `
precision highp float;
#define MAX_POINTS 64
uniform vec2 uResolution;
uniform vec2 uPoints[MAX_POINTS];
uniform float uPointCount;
uniform vec3 uColor;
uniform vec3 uSecondaryColor;
uniform float uTrailWidth;
uniform float uTaper;
uniform float uGlowIntensity;
uniform float uGlowSpread;
uniform float uHotspot;
uniform float uBrightness;
uniform float uOpacity;
uniform float uPulseSpeed;
uniform float uNoiseStrength;
uniform float uNormalBlend;
uniform float uTime;
uniform float uFade;
varying vec2 vUv;

float sRGB(float x) {
  if (x <= 0.00031308) return 12.92 * x;
  return 1.055 * pow(x, 1.0 / 2.4) - 0.055;
}
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float filmGrain(vec2 p, float time) {
  float frame = time * 18.0;
  float frameIndex = mod(floor(frame), 256.0);
  float nextFrameIndex = mod(frameIndex + 1.0, 256.0);
  float blend = fract(frame);
  blend = blend * blend * (3.0 - 2.0 * blend);
  vec2 pixel = floor(p);
  float current = hash(pixel + vec2(frameIndex * 17.0, frameIndex * 31.0));
  float next = hash(pixel + vec2(nextFrameIndex * 17.0, nextFrameIndex * 31.0));
  return mix(current, next, blend) * 2.0 - 1.0;
}
void main() {
  vec2 pixel = vUv * uResolution;
  float denominator = max(uPointCount - 1.0, 1.0);
  float strongest = 0.0;
  float strongestCore = 0.0;
  float colorWeight = 0.0;
  vec3 colorSum = vec3(0.0);
  for (int i = 0; i < MAX_POINTS - 1; i++) {
    float index = float(i);
    // Uniform early exit skips unused segments without changing the active trail.
    if (index >= uPointCount - 1.0) break;
    vec2 start = uPoints[i];
    vec2 end = uPoints[i + 1];
    vec2 toPixel = pixel - start;
    vec2 segment = end - start;
    float along = clamp(dot(toPixel, segment) / max(dot(segment, segment), 0.0001), 0.0, 1.0);
    float progress = clamp((index + along) / denominator, 0.0, 1.0);
    float life = pow(max(1.0 - progress, 0.0), mix(0.55, 1.25, uTaper));
    float width = uTrailWidth * mix(1.0, 0.25, pow(progress, mix(0.55, 1.6, uTaper)));
    float distanceToTrail = length(toPixel - segment * along);
    float falloff = max(width * (0.8 + uGlowSpread * 1.4), 0.5);
    float beam = min(1.0, (falloff * falloff) / (distanceToTrail * distanceToTrail + falloff * falloff));
    float core = exp(-pow(distanceToTrail / max(width, 0.5), 2.0) * 2.5);
    float pulseAmount = min(abs(uPulseSpeed), 1.0);
    float pulse = 1.0 + sin(uTime * uPulseSpeed * 3.0 - progress * 11.0) * 0.16 * pulseAmount;
    float intensity = (core + beam * uGlowIntensity * 0.55) * life * pulse;
    vec3 segmentColor = mix(uColor, uSecondaryColor, progress);
    strongest = max(strongest, intensity);
    strongestCore = max(strongestCore, core * life);
    colorSum += segmentColor * intensity;
    colorWeight += intensity;
  }
  float grain = filmGrain(pixel, uTime);
  float noiseAmount = (1.0 - exp(-uNoiseStrength * 2.2)) * 0.4;
  float alpha = clamp(strongest * uOpacity * uFade, 0.0, 1.0);
  if (alpha < 0.0005) discard;
  vec3 color = colorSum / max(colorWeight, 0.0001);
  color = mix(color, vec3(1.0), smoothstep(0.25, 0.95, strongestCore) * uHotspot);
  float luminance = sRGB(clamp(strongest * uBrightness, 0.0, 1.0));
  luminance *= 1.0 + grain * noiseAmount;
  vec3 additiveColor = color * luminance;
  float normalAlpha = clamp(strongest * uBrightness * uOpacity * uFade, 0.0, 1.0);
  vec3 normalColor = mix(color, vec3(1.0), smoothstep(0.45, 1.0, strongestCore) * uHotspot * 0.35);
  gl_FragColor = vec4(mix(additiveColor, normalColor, uNormalBlend), mix(alpha, normalAlpha, uNormalBlend));
}`;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const rgb = hex => {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
};

function mountGlowCursor(container) {
  if (container.querySelector('.lab-glow-cursor__canvas')) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'lab-glow-cursor__canvas';
  canvas.setAttribute('aria-hidden', 'true');
  container.prepend(canvas);
  const config = {trailLength:40, trailWidth:8, trailTaper:.8, followSpeed:.16,
    glowIntensity:1.9, glowSpread:1.2, hotspot:.65, brightness:1.25, opacity:1,
    pulseSpeed:1.1, noiseStrength:.035, idleTimeout:700, fadeDuration:900};
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  // OGL resolves GLSL array uniforms through Array.isArray(value).
  const pointData = Array(MAX_POINTS * 2).fill(0);
  const points = Array.from({length:MAX_POINTS}, () => ({x:0, y:0}));
  const target = {x:0, y:0}, head = {x:0, y:0};
  const events = new AbortController();
  let renderer = null, program = null, mesh = null, gl = null;
  let width = 1, height = 1, initialized = false, pointerInside = false, fade = 0;
  let visible = true, suspended = false, destroyed = false, failed = false;
  let lastInputTime = 0, lastFrameTime = 0, raf = 0;

  function clear() {
    if (gl && !gl.isContextLost()) gl.clear(gl.COLOR_BUFFER_BIT);
  }
  function stop(reset = false) {
    cancelAnimationFrame(raf);
    raf = 0;
    lastFrameTime = 0;
    if (reset) {fade = 0; initialized = false; pointerInside = false; clear();}
  }
  function canRun() {
    return !destroyed && !failed && !suspended && visible && !document.hidden && !reduced.matches;
  }
  function wake() {
    if (canRun() && renderer && initialized && !raf) raf = requestAnimationFrame(render);
  }
  function theme() {
    if (!program) return;
    const light = document.documentElement.dataset.theme === 'light';
    program.uniforms.uColor.value = rgb(light ? '#1688B8' : '#67E8F9');
    program.uniforms.uSecondaryColor.value = rgb(light ? '#7053CB' : '#A78BFA');
    program.uniforms.uNormalBlend.value = light ? 1 : 0;
    program.uniforms.uHotspot.value = light ? .18 : config.hotspot;
    wake();
  }
  function resize() {
    if (destroyed || !renderer) return;
    const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
    const dpr = Math.min(devicePixelRatio || 1, 1.5, Math.sqrt(520000 / (w * h)));
    if (w === width && h === height && renderer.dpr === dpr) return;
    width = w; height = h; renderer.dpr = dpr;
    renderer.setSize(width, height);
    program.uniforms.uResolution.value = [width, height];
    stop(true);
  }
  function prepare() {
    if (renderer) return true;
    if (failed || destroyed) return false;
    try {
      renderer = new Renderer({canvas, alpha:true, depth:false, dpr:1, antialias:false});
      gl = renderer.gl;
      gl.clearColor(0, 0, 0, 0);
      program = new Program(gl, {
        vertex:VERTEX_SHADER, fragment:FRAGMENT_SHADER,
        uniforms:{
          uResolution:{value:[1, 1]}, uPoints:{value:pointData}, uPointCount:{value:config.trailLength},
          uColor:{value:rgb('#67E8F9')}, uSecondaryColor:{value:rgb('#A78BFA')},
          uTrailWidth:{value:config.trailWidth}, uTaper:{value:config.trailTaper},
          uGlowIntensity:{value:config.glowIntensity}, uGlowSpread:{value:config.glowSpread},
          uHotspot:{value:config.hotspot}, uBrightness:{value:config.brightness},
          uOpacity:{value:config.opacity}, uPulseSpeed:{value:config.pulseSpeed},
          uNoiseStrength:{value:config.noiseStrength}, uNormalBlend:{value:0},
          uTime:{value:0}, uFade:{value:0},
        }, transparent:true, depthTest:false, depthWrite:false,
      });
      if (!gl.getProgramParameter(program.program, gl.LINK_STATUS)) throw new Error('Glow shader unavailable');
      mesh = new Mesh(gl, {geometry:new Triangle(gl), program});
      resize();
      theme();
      return true;
    } catch (_) {
      failed = true;
      mesh?.geometry.remove();
      program?.remove();
      renderer = program = mesh = null;
      canvas.remove();
      return false;
    }
  }
  function initializeTrail(x, y) {
    target.x = head.x = x;
    target.y = head.y = y;
    for (const point of points) {point.x = x; point.y = y;}
    initialized = true;
    fade = 1;
  }
  function updatePointer(event) {
    // Preserve touch scrolling and the existing touch/scatter gestures.
    if (event.pointerType === 'touch' || !canRun() || !prepare()) return;
    const rect = container.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) * container.offsetWidth / (rect.width || 1) - container.clientLeft, 0, width);
    const localY = (event.clientY - rect.top) * container.offsetHeight / (rect.height || 1) - container.clientTop;
    const y = clamp(height - localY, 0, height);
    if (!initialized || fade < .015) initializeTrail(x, y);
    target.x = x; target.y = y;
    pointerInside = true;
    lastInputTime = performance.now();
    wake();
  }
  function leave() {
    pointerInside = false;
    lastInputTime = performance.now();
    wake();
  }
  function render(now) {
    raf = 0;
    if (!canRun()) {stop(true); return;}
    const delta = lastFrameTime ? clamp((now - lastFrameTime) / 16.667, 0, 3) : 1;
    lastFrameTime = now;
    const headEase = 1 - Math.pow(1 - config.followSpeed, delta);
    const chainBase = clamp(.28 + config.followSpeed * .35, .08, .92);
    const chainEase = 1 - Math.pow(1 - chainBase, delta);
    head.x += (target.x - head.x) * headEase;
    head.y += (target.y - head.y) * headEase;
    points[0].x = head.x; points[0].y = head.y;
    for (let i = 1; i < MAX_POINTS; i++) {
      points[i].x += (points[i - 1].x - points[i].x) * chainEase;
      points[i].y += (points[i - 1].y - points[i].y) * chainEase;
    }
    for (let i = 0; i < MAX_POINTS; i++) {
      pointData[i * 2] = points[i].x;
      pointData[i * 2 + 1] = points[i].y;
    }
    const shouldFade = !pointerInside || now - lastInputTime > config.idleTimeout;
    const fadeStep = 16.667 * delta / config.fadeDuration;
    fade += ((shouldFade ? 0 : 1) - fade) * Math.min(1, fadeStep * 7);
    if (shouldFade && fade < .001) {stop(true); return;}
    program.uniforms.uTime.value = now * .001;
    program.uniforms.uFade.value = fade;
    renderer.render({scene:mesh});
    raf = requestAnimationFrame(render);
  }
  function dispose() {
    if (destroyed) return;
    destroyed = true;
    stop(true);
    resizeObserver?.disconnect();
    visibilityObserver?.disconnect();
    events.abort();
    mesh?.geometry.remove();
    program?.remove();
    canvas.remove();
    renderer = program = mesh = gl = null;
  }
  const listen = (target, type, listener) => target.addEventListener(type, listener, {passive:true, signal:events.signal});
  listen(container, 'pointerenter', updatePointer);
  listen(container, 'pointermove', updatePointer);
  listen(container, 'pointerleave', leave);
  listen(container, 'pointercancel', leave);
  listen(window, 'resize', resize);
  listen(window, 'site-theme-change', theme);
  listen(document, 'visibilitychange', () => {if (document.hidden) stop(true);});
  listen(reduced, 'change', () => {if (reduced.matches) stop(true);});
  listen(window, 'pagehide', event => {if (event.persisted) {suspended = true; stop(true);} else dispose();});
  listen(window, 'pageshow', () => {suspended = false; resize();});
  listen(canvas, 'webglcontextlost', () => {failed = true; dispose();});
  const resizeObserver = 'ResizeObserver' in window ? new ResizeObserver(resize) : null;
  const visibilityObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (!visible) stop(true);
  }) : null;
  resizeObserver?.observe(container);
  visibilityObserver?.observe(container);
}

const hero = document.getElementById('labParticleHero');
if (hero) mountGlowCursor(hero);
