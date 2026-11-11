// VIDEOTHEK LENZ · Renderer, Schleife, Qualitätsautomatik, Resize, Sichtbarkeit und Kontextverlust.
import { WebGLRenderer, Scene, PerspectiveCamera, ACESFilmicToneMapping, SRGBColorSpace, PCFShadowMap, Color } from 'three';
import { presetFor, AutoQuality } from './quality.js';

const DEG = Math.PI / 180;

export function createEngine({ host, level, auto, phone, onContextLost, onContextRestored, onAutoLevel }) {
  let preset = presetFor(level, phone);
  const canvas = document.createElement('canvas');
  canvas.className = 'lfx-store-canvas';
  host.appendChild(canvas);

  let renderer;
  try {
    renderer = new WebGLRenderer({
      canvas,
      antialias: !(phone && level === 'low'),
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
    });
  } catch (err) {
    canvas.remove();
    throw err;
  }
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.shadowMap.enabled = preset.shadows;
  renderer.setClearColor(new Color(0x0b0d1c), 1);

  const scene = new Scene();
  const camera = new PerspectiveCamera(70, 1, 0.05, 90);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  const aq = new AutoQuality(level);
  let autoOn = !!auto;
  let tick = null;
  let running = false;
  let last = 0;
  let lost = false;
  let curHost = host;
  let ro = null;
  let fps = 60;
  let frameMs = 16;
  let acc = 0;
  let tickMs = 0;
  let renderMs = 0;
  let accN = 0;
  let baseFov = 70;
  let zoom = 1;

  function applyRatio() {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.pixelRatio));
  }

  function resize() {
    const w = Math.max(1, curHost.clientWidth || window.innerWidth);
    const h = Math.max(1, curHost.clientHeight || window.innerHeight);
    renderer.setSize(w, h, false);
    const a = w / h;
    camera.aspect = a;
    // Hochformat: horizontales FOV bei ~64° halten; Querformat: 70° vertikal
    baseFov = a < 1.2 ? Math.min(100, (2 * Math.atan(Math.tan(32 * DEG) / a)) / DEG) : 70;
    applyFov();
  }

  function applyFov() {
    camera.fov = baseFov / zoom;
    camera.updateProjectionMatrix();
  }

  function setZoom(z) {
    const v = Math.max(1, Number(z) || 1);
    if (v === zoom) return;
    zoom = v;
    applyFov();
  }

  function loop(time) {
    const now = time || performance.now();
    let dt = (now - last) / 1000;
    last = now;
    if (!(dt > 0)) dt = 1 / 60;
    if (dt > 0.25) dt = 0.016;
    acc += dt;
    accN++;
    if (acc >= 0.5) { fps = accN / acc; frameMs = (acc / accN) * 1000; acc = 0; accN = 0; }
    if (autoOn) {
      const l = aq.sample(dt, now);
      if (l) { setLevel(l); if (onAutoLevel) onAutoLevel(l); }
    }
    const t0 = performance.now();
    if (tick) tick(dt, now);
    const t1 = performance.now();
    renderer.render(scene, camera);
    const t2 = performance.now();
    tickMs += (t1 - t0 - tickMs) * 0.05;
    renderMs += (t2 - t1 - renderMs) * 0.05;
  }

  function go() {
    if (!running || lost || document.hidden) return;
    last = performance.now();
    renderer.setAnimationLoop(loop);
  }
  function halt() { renderer.setAnimationLoop(null); }

  function setLevel(l) {
    const prev = preset;
    preset = presetFor(l, phone);
    aq.setLevel(preset.level);
    applyRatio();
    resize();
    if (prev.shadows !== preset.shadows) {
      renderer.shadowMap.enabled = preset.shadows;
      scene.traverse((o) => {
        const m = o.material;
        if (Array.isArray(m)) m.forEach((x) => { x.needsUpdate = true; });
        else if (m) m.needsUpdate = true;
      });
    }
    return preset;
  }

  const onVis = () => { if (document.hidden) halt(); else go(); };
  const onLost = (e) => { e.preventDefault(); lost = true; halt(); if (onContextLost) onContextLost(); };
  const onRestored = () => { lost = false; if (onContextRestored) onContextRestored(); go(); };
  const onWin = () => resize();
  document.addEventListener('visibilitychange', onVis);
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  window.addEventListener('resize', onWin);

  function observe() {
    if (ro) ro.disconnect();
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(() => resize());
      ro.observe(curHost);
    }
  }
  applyRatio();
  observe();
  resize();

  return {
    renderer, scene, camera, canvas,
    get preset() { return preset; },
    get fps() { return fps; },
    get frameMs() { return frameMs; },
    get tickMs() { return tickMs; },
    get renderMs() { return renderMs; },
    get baseFov() { return baseFov; },
    get zoom() { return zoom; },
    get lost() { return lost; },
    get host() { return curHost; },
    setLevel,
    setZoom,
    setAuto(v) { autoOn = !!v; aq.setLevel(preset.level); },
    resize,
    setHost(h) { curHost = h; observe(); resize(); },
    start(fn) { tick = fn; running = true; go(); },
    stop() { running = false; halt(); },
    dispose() {
      running = false;
      halt();
      document.removeEventListener('visibilitychange', onVis);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      window.removeEventListener('resize', onWin);
      if (ro) ro.disconnect();
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch { /* egal */ }
      canvas.remove();
    },
  };
}
