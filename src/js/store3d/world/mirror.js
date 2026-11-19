// VIDEOTHEK LENZ · Spiegel (1.17.0): eigener Planspiegel statt three-Reflector (der nutzt HalfFloat/MSAA und kennt keine Ebenen).
// - Spiegelkamera mit schiefer Near-Ebene (Mathe wie Reflector), RenderTarget 256² UnsignedByte ohne MSAA, rendert Layer 0 + 2 (nie 1:
//   Layer 1 = Ego-Körper nur für die Hauptkamera, Layer 2 = volle eigene Figur nur im Spiegel).
// - Takt 10 Hz (mid) / 20 Hz (high); gerendert wird nur, wenn der Spiegel im Bild, zugewandt und < 8 m entfernt ist.
//   Bei low und in XR: matter statischer Verlauf (kein Render, kein RenderTarget).
// - Höchstens EIN Spiegel gleichzeitig live (Hub je Renderer): der nächste gewinnt.
// - Messfalle: `renderer.info.autoReset` wird für den verschachtelten Render ausgeschaltet und danach zurückgesetzt, damit die Draw-Call-Zahl des
//   Hauptbildes stimmt (stats().calls). Dasselbe für `shadowMap.autoUpdate`. Zustand wird im finally wiederhergestellt.
// Rein testbar: mirrorGate/mirrorHz sind reine Funktionen; createMirror bekommt Renderer/Kamera/Szene per ctx (Attrappen im Test).
import {
  WebGLRenderTarget, PerspectiveCamera, Vector3, Vector4, Matrix4, Plane, Frustum, Sphere, Mesh, PlaneGeometry, ShaderMaterial,
  UnsignedByteType, LinearFilter,
} from 'three';

export const MIRROR_RT = 256;
export const MIRROR_MAX_DIST = 8;
/** Eine Spiegelkamera sieht nie weiter (m): schont Draw-Calls. */
export const MIRROR_FAR = 40;
/** Layer: 1 = nur Hauptkamera (Ego-Körper), 2 = nur Spiegelkamera (volle eigene Figur). */
export const LAYER_EGO = 1;
export const LAYER_MIRROR = 2;

/** Renderrate des Spiegels in Hz je Qualitätsstufe (0 = matt, kein Render). */
export function mirrorHz(level) {
  if (level === 'ultra') return 30; // Startwert, Messung legt fest
  if (level === 'high') return 20;
  if (level === 'mid') return 10;
  return 0;
}

/**
 * Darf der Spiegel jetzt live rendern? (rein)
 * @param {{quality:string, xr:boolean, store:boolean, visible:boolean, facing:boolean, dist:number, maxDist?:number}} s
 */
export function mirrorGate(s) {
  if (!s || s.xr || s.store === false) return false;
  if (mirrorHz(s.quality) <= 0) return false;
  if (!s.visible || !s.facing) return false;
  return Number.isFinite(s.dist) && s.dist < (s.maxDist || MIRROR_MAX_DIST);
}

// ------------------------------------------------------------------ Hub: höchstens ein Spiegel live
const HUBS = new WeakMap();
const STALE_MS = 600;
/** Hub je Renderer: `claim(id, dist, now)` → true, wenn dieser Spiegel jetzt rendern darf. */
export function liveHub(key) {
  let h = HUBS.get(key);
  if (h) return h;
  let owner = null;
  h = {
    claim(id, dist, now) {
      if (!owner || owner.id === id || now - owner.at > STALE_MS || dist < owner.dist - 0.75) {
        owner = { id, dist, at: now };
        return true;
      }
      return false;
    },
    release(id) { if (owner && owner.id === id) owner = null; },
    owner: () => (owner ? owner.id : null),
  };
  HUBS.set(key, h);
  return h;
}

// ------------------------------------------------------------------ Shader
const VERT = /* glsl */ `
uniform mat4 textureMatrix;
varying vec4 vProj;
varying vec2 vUv;
void main() {
  vUv = uv;
  vProj = textureMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uLive;
uniform vec3 uMatteA;
uniform vec3 uMatteB;
varying vec4 vProj;
varying vec2 vUv;
void main() {
  vec3 c;
  if (uLive > 0.5) c = texture2DProj(tDiffuse, vProj).rgb * vec3(0.97, 0.99, 1.0);
  else c = mix(uMatteB, uMatteA, vUv.y);
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Material des Planspiegels: live = Textur der Spiegelkamera, sonst matter Verlauf (Farben linear). */
function mirrorMaterial(rt) {
  return new ShaderMaterial({
    uniforms: {
      tDiffuse: { value: rt ? rt.texture : null },
      textureMatrix: { value: new Matrix4() },
      uLive: { value: 0 },
      uMatteA: { value: new Vector3(0.52, 0.6, 0.66) },
      uMatteB: { value: new Vector3(0.22, 0.26, 0.31) },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
  });
}

/**
 * Schattenkarten bereit? three legt `light.shadow.map` erst im ersten Hauptbild an. Rendert der Spiegel davor (autoUpdate aus),
 * bekommt der Shadow-Sampler eine RGBA8-Textur (GL_INVALID_OPERATION). Ohne Schatten (low/mid) oder ohne Schatten-Lampe: sofort bereit.
 */
export function shadowsReady(renderer, scene) {
  const sm = renderer && renderer.shadowMap;
  if (!sm || !sm.enabled) return true;
  let ok = true;
  scene.traverse((o) => { if (o.isLight && o.castShadow && o.shadow && !o.shadow.map) ok = false; });
  return ok;
}

// ------------------------------------------------------------------ Render-Gerüst (auch für den Überwachungsspiegel)
/** Rendert `scene` mit `cam` in ein RenderTarget; stellt Renderer-Zustand sicher wieder her. `hide` = Objekte, die währenddessen unsichtbar sind. */
export function renderToTarget(renderer, scene, cam, rt, hide = []) {
  const prevRt = renderer.getRenderTarget();
  const info = renderer.info;
  const prevAuto = info ? info.autoReset : undefined;
  const sm = renderer.shadowMap;
  const prevShadow = sm ? sm.autoUpdate : undefined;
  const prevVis = hide.map((o) => o.visible);
  try {
    if (info) info.autoReset = false;
    if (sm) sm.autoUpdate = false;
    for (const o of hide) o.visible = false;
    renderer.setRenderTarget(rt);
    renderer.render(scene, cam);
  } finally {
    hide.forEach((o, i) => { o.visible = prevVis[i]; });
    renderer.setRenderTarget(prevRt);
    if (info) info.autoReset = prevAuto;
    if (sm) sm.autoUpdate = prevShadow;
  }
}

export function makeTarget(size = MIRROR_RT) {
  return new WebGLRenderTarget(size, size, { type: UnsignedByteType, samples: 0, depthBuffer: true, minFilter: LinearFilter, magFilter: LinearFilter, generateMipmaps: false });
}

const _a = new Vector3();
const _b = new Vector3();
const _normal = new Vector3();
const _view = new Vector3();
const _target = new Vector3();
const _look = new Vector3();
const _q = new Vector4();
const _clip = new Vector4();
const _plane = new Plane();
const _rot = new Matrix4();
const _pv = new Matrix4();
const _fr = new Frustum();
const _sph = new Sphere();

/**
 * Planspiegel anlegen. `o`: { x, y, z, yaw, w, h, parent?, id?, now?() , maxDist?, quality?() }.
 * ctx: renderer, scene, camera, quality(), xr.presenting(), stage.isStore() (alle bis auf renderer/scene/camera optional).
 * Rückgabe: { mesh, update(dt), isLive(), wanted(), stats(), setSuppressed(bool), dispose() }.
 * Das Mesh trägt Normale +z (nach yaw gedreht); yaw = PI heißt Blick nach −z (wie die Layout-Anker).
 */
export function createMirror(ctx, o) {
  const id = o.id || 'mirror';
  const now = o.now || (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const hub = liveHub(ctx.renderer || ctx);
  const mat = mirrorMaterial(null);
  const mesh = new Mesh(new PlaneGeometry(o.w, o.h), mat);
  mesh.name = `mirror-${id}`;
  mesh.position.set(o.x, o.y, o.z);
  mesh.rotation.y = o.yaw || 0;
  mesh.frustumCulled = true;
  if (o.parent) o.parent.add(mesh);
  mesh.updateMatrixWorld(true);
  const radius = Math.hypot(o.w, o.h) / 2;

  const vcam = new PerspectiveCamera();
  vcam.layers.set(0);
  vcam.layers.enable(LAYER_MIRROR);
  let rt = null;
  let rtSize = MIRROR_RT;
  let acc = 1;
  let rendered = false;
  let live = false;
  let suppressed = false;
  let renders = 0;
  let wanted = false;

  const chainVisible = () => { for (let n = mesh; n; n = n.parent) if (n.visible === false) return false; return true; };

  function setup(cam) {
    mesh.updateWorldMatrix(true, false);
    cam.updateMatrixWorld();
    _a.setFromMatrixPosition(mesh.matrixWorld); // Spiegelmitte
    _b.setFromMatrixPosition(cam.matrixWorld); // Kamera
    _rot.extractRotation(mesh.matrixWorld);
    _normal.set(0, 0, 1).applyMatrix4(_rot);
    _view.subVectors(_a, _b);
    if (_view.dot(_normal) > 0) return false; // Rückseite
    _view.reflect(_normal).negate().add(_a);
    _rot.extractRotation(cam.matrixWorld);
    _look.set(0, 0, -1).applyMatrix4(_rot).add(_b);
    _target.subVectors(_a, _look).reflect(_normal).negate().add(_a);
    vcam.position.copy(_view);
    vcam.up.set(0, 1, 0).applyMatrix4(_rot).reflect(_normal);
    vcam.lookAt(_target);
    vcam.near = cam.near;
    vcam.far = Math.min(cam.far, MIRROR_FAR);
    vcam.fov = cam.fov;
    vcam.aspect = cam.aspect;
    vcam.updateProjectionMatrix();
    vcam.updateMatrixWorld();
    vcam.matrixWorldInverse.copy(vcam.matrixWorld).invert();
    const tm = mat.uniforms.textureMatrix.value;
    tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    tm.multiply(vcam.projectionMatrix).multiply(vcam.matrixWorldInverse).multiply(mesh.matrixWorld);
    // schiefe Near-Ebene = Spiegelebene (Objekte hinter dem Spiegel fallen weg)
    _plane.setFromNormalAndCoplanarPoint(_normal, _a).applyMatrix4(vcam.matrixWorldInverse);
    _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
    const p = vcam.projectionMatrix.elements;
    _q.x = (Math.sign(_clip.x) + p[8]) / p[0];
    _q.y = (Math.sign(_clip.y) + p[9]) / p[5];
    _q.z = -1;
    _q.w = (1 + p[10]) / p[14];
    _clip.multiplyScalar(2 / _clip.dot(_q));
    p[2] = _clip.x;
    p[6] = _clip.y;
    p[10] = _clip.z + 1 - 0.003;
    p[14] = _clip.w;
    return true;
  }

  // Schatten-Bereitschaft: einmal bereit, nicht mehr bei jedem Bild die ganze Szene durchlaufen; Schalter (Stufenwechsel) oder Größenwechsel setzen zurück.
  let shadowOk = false;
  let shadowOn = null;
  function shadowsOk() {
    const on = !!(ctx.renderer.shadowMap && ctx.renderer.shadowMap.enabled);
    if (on !== shadowOn) { shadowOn = on; shadowOk = false; }
    if (shadowOk) return true;
    shadowOk = shadowsReady(ctx.renderer, ctx.scene);
    return shadowOk;
  }

  function renderNow() {
    const cam = ctx.camera;
    if (!shadowsOk()) return false; // erstes Hauptbild legt die Schattenkarten an
    if (!setup(cam)) return false;
    if (rt && rt.width !== rtSize) { rt.dispose(); rt = null; }
    if (!rt) { rt = makeTarget(rtSize); mat.uniforms.tDiffuse.value = rt.texture; }
    renderToTarget(ctx.renderer, ctx.scene, vcam, rt, [mesh]);
    renders++;
    return true;
  }

  const api = {
    mesh,
    /** Auflösung des Spiegelbilds ändern (z. B. 1024 beim Frisieren, MIRROR_RT sonst); legt das Ziel beim nächsten Bild neu an. */
    setSize(n) {
      const v = Math.max(64, Math.min(2048, Math.round(Number(n)) || MIRROR_RT));
      if (v === rtSize) return;
      shadowOk = false;
      rtSize = v; // das alte Ziel bleibt bis zum nächsten Spiegelbild stehen (kein Schwarzbild), renderNow tauscht es
    },
    getSize: () => rtSize,
    /** Wird pro Frame aus update(dt) des Moduls gerufen (vor dem Hauptbild). */
    update(dt) {
      const cam = ctx.camera;
      const level = typeof ctx.quality === 'function' ? ctx.quality() : 'low';
      const xr = !!(ctx.xr && typeof ctx.xr.presenting === 'function' && ctx.xr.presenting());
      const store = !(ctx.stage && typeof ctx.stage.isStore === 'function') || ctx.stage.isStore();
      wanted = false;
      if (suppressed || xr || mirrorHz(level) <= 0 || !store) {
        if (live) { live = false; mat.uniforms.uLive.value = 0; hub.release(id); }
        return;
      }
      cam.updateMatrixWorld();
      _b.setFromMatrixPosition(cam.matrixWorld);
      mesh.updateWorldMatrix(true, false);
      _a.setFromMatrixPosition(mesh.matrixWorld);
      _rot.extractRotation(mesh.matrixWorld);
      _normal.set(0, 0, 1).applyMatrix4(_rot);
      const dist = _b.distanceTo(_a);
      const facing = _view.subVectors(_b, _a).dot(_normal) > 0;
      _pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      _fr.setFromProjectionMatrix(_pv);
      _sph.set(_a, radius);
      const visible = chainVisible() && _fr.intersectsSphere(_sph);
      const gate = mirrorGate({ quality: level, xr, store, visible, facing, dist, maxDist: o.maxDist });
      if (!gate) {
        hub.release(id);
        if (visible && live) { live = false; mat.uniforms.uLive.value = 0; } // im Bild, aber abgewandt oder zu weit: matt; außerhalb des Bildes bleibt das letzte Bild stehen
        return;
      }
      wanted = true;
      if (!hub.claim(id, dist, now())) return;
      acc += dt;
      if (acc < 1 / mirrorHz(level)) return;
      acc = 0;
      if (renderNow()) { rendered = true; live = true; mat.uniforms.uLive.value = 1; }
    },
    isLive: () => live && rendered,
    wanted: () => wanted,
    stats: () => ({ renders, live: live && rendered, hasTarget: !!rt }),
    /** Zeitweise aus (z. B. anderer Spiegel soll live sein / Editor offen mit Studio). */
    setSuppressed(on) { suppressed = !!on; if (suppressed && live) { live = false; mat.uniforms.uLive.value = 0; hub.release(id); } },
    dispose() {
      hub.release(id);
      mesh.removeFromParent();
      mesh.geometry.dispose();
      mat.dispose();
      if (rt) { rt.dispose(); rt = null; }
    },
  };
  return api;
}
