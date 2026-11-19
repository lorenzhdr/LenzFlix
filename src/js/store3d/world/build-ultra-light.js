// VIDEOTHEK LENZ · Ultra-Details „Licht & Atmosphäre“ (1.19.0, Stufe 'ultra'): Neon-Halos, Lichtpools/Wandwäsche, Kontaktschatten.
// Reine Bauer: jeder liefert { object, update(dt, t), dispose() } für die Ultra-Registry (engine/ultra.js, Provider 'ultra').
// Kosten: neon 1 Draw-Call (ein ShaderMaterial, Flackern per Vertexattribut), pools 1, shadows 1 (ein InstancedMesh für statische + dynamische Blobs) = 3
// (pools tragen forceSinglePass: das transparente DoubleSide-MeshBasicMaterial zeichnete sonst in zwei Durchgängen, gemessen 2 statt 1 Draw-Call; die ShaderMaterialien neon/precip/wet nicht).
// Alles unbeleuchtet (Basic bzw. kleiner Shader), Canvas-Texturen, additiv bzw. normal mit niedriger Deckkraft, depthWrite aus, kein Nebel.
// Zustandsbehaftetes (Wetter, Passanten, Autos, Mitspieler, Selbstansicht) nur über Provider mit Guard (ctx.use).
import {
  Group, Mesh, InstancedMesh, MeshBasicMaterial, ShaderMaterial, PlaneGeometry, AdditiveBlending, DoubleSide, DynamicDrawUsage,
  Float32BufferAttribute, Vector3,
} from 'three';
import { quad, merge, hex } from '../util/geo.js';
import { makeCanvas, toTexture } from './textures.js';
import { glowCanvas } from '../modules/outdoor.js';
import { CAR_LEN, CAR_W } from '../npc/cars-logic.js';
import { groundHeight } from '../nav/collide.js';
import { shaderTime } from '../weather/precip-logic.js';

const PI = Math.PI;

// ---------------------------------------------------------------------------------------------------- reine Kurven

/** Stärke der Neon-Halos: nachts voll, abends fast, tagsüber schwach; Regen verstärkt leicht (nasse Luft). */
export function neonStrength(tod, raining) {
  const base = tod === 'night' ? 0.5 : tod === 'dusk' ? 0.4 : 0.08;
  return base * (raining && tod !== 'day' ? 1.08 : 1);
}
/** Stärke der Lichtpools/Wandwäsche: nur abends/nachts. */
export function poolStrength(tod) { return tod === 'night' ? 1 : tod === 'dusk' ? 0.62 : 0; }
/** Deckkraft der Kontaktschatten: tagsüber kräftiger, nachts weicher, bei Regen etwas heller (diffuses Licht). */
export function shadowOpacity(tod, raining) { return (tod === 'night' ? 0.26 : tod === 'dusk' ? 0.32 : 0.4) * (raining ? 0.8 : 1); }

/** Pool-Faktor bei liegendem Schnee: additives Warmlicht brennt auf hellem Boden aus, daher bei voller Decke nur 40 %. */
export function poolSnowFactor(cover) { return 1 - 0.6 * (Number.isFinite(cover) ? Math.min(1, Math.max(0, cover)) : 0); }
/** Halo-Faktor bei Nebel (0..1): der Halo wird ohne Nebel gezeichnet, dichter Nebel dämpft ihn bis auf 45 %. */
export function neonFogFactor(fog) { return 1 - 0.55 * (Number.isFinite(fog) ? Math.min(1, Math.max(0, fog)) : 0); }
/**
 * Kontaktschatten in der Luft: h = Höhe der Füße über dem Boden. Größenfaktor 0..1 (bis 8 cm = Stufe/Schritt voll, ab 1,5 m weg).
 * Deckkraft je Instanz gibt es nicht, deshalb schrumpft der Blob; 0 = nicht zeichnen.
 */
export function airShadowScale(h) {
  if (!Number.isFinite(h) || h <= 0.08) return 1;
  const k = 1 - h / 1.5;
  return k > 0.05 ? 0.4 + 0.6 * k : 0;
}

const lerp = (a, b, k) => a + (b - a) * Math.min(1, k);

// Wiederverwendetes Ergebnisobjekt je ctx (kein Objekt pro Frame und Aufruf); Aufrufer lesen es synchron und behalten es nie.
const WEATHER_OF = new WeakMap();
export function weatherOf(ctx) {
  const w = ctx.use && ctx.use('weather');
  let r = WEATHER_OF.get(ctx);
  if (!r) { r = { tod: 'day', raining: false, cover: 0, fog: 0 }; WEATHER_OF.set(ctx, r); }
  r.tod = (w && w.tod) || 'day';
  r.raining = !!(w && w.raining);
  r.cover = w && Number.isFinite(w.cover) ? w.cover : 0;
  r.fog = w && Number.isFinite(w.fog) ? w.fog : 0;
  return r;
}

// ---------------------------------------------------------------------------------------------------- Quellen (rein)

const normalOf = (yaw) => ({ nx: Math.sin(yaw), nz: Math.cos(yaw) });

/** Alle Leuchtschilder als { x, y, z, yaw, w, h, color:[r,g,b], flick } (Weltkoordinaten, Normale = (sin yaw, cos yaw)). */
export function neonSources(L) {
  const out = [];
  const c = L.city;
  if (!c) return out;
  const W = L.w;
  const sw = Math.min(W - 1.4, 7.4);
  out.push({ id: 'shop', x: W / 2, y: 4.0, z: L.d + 0.05, yaw: 0, w: sw, h: sw / 4, color: [0.3, 0.88, 1], flick: 0.35 });
  for (const s of c.signs || []) {
    if (s.id !== 'palast' && s.id !== 'kiosk' && s.id !== 'alley') continue;
    out.push({ id: s.id, x: s.x, y: s.y, z: s.z, yaw: s.yaw, w: s.w, h: s.w / 4, color: hex(s.color), flick: s.id === 'alley' ? 0.8 : 0.4 });
  }
  for (const f of c.shopFronts || []) {
    out.push({ id: `front-${f.id}`, x: f.x, y: f.y, z: f.z, yaw: f.yaw, w: f.w, h: f.w * 0.2, color: hex(f.color), flick: f.id === 'SW' ? 0.2 : 0.3 });
  }
  const cp = c.palast && c.palast.canopy;
  if (cp) out.push({ id: 'canopy', x: (cp.x0 + cp.x1) / 2, y: cp.y + 0.09, z: cp.z0 - 0.02, yaw: PI, w: cp.x1 - cp.x0, h: 0.3, color: [1, 0.78, 0.4], flick: 0 });
  return out;
}

/** Lichtpools: { floor: [{x,z,w,d,color}], wall: [{x,y,z,yaw,w,h,color}] } (Weltkoordinaten). */
export function poolSources(L) {
  const floor = [];
  const wall = [];
  const c = L.city;
  if (!c) return { floor, wall };
  const WARM = [1, 0.78, 0.45];
  // Wände, die Straßenlicht bekommen: Ladenfront + Häuser mit front (Ebene z, Normale n = ±1)
  const walls = [{ x0: 0, x1: L.w, z: L.d, n: 1 }];
  for (const b of c.buildings || []) {
    if (b.front === 'S') walls.push({ x0: b.x0, x1: b.x1, z: b.z1, n: 1 });
    else if (b.front === 'N') walls.push({ x0: b.x0, x1: b.x1, z: b.z0, n: -1 });
  }
  for (const l of c.lights || []) {
    const lz = l.z + l.armDz;
    floor.push({ x: l.x, z: l.z + l.armDz * 0.9, w: 6.4, d: 6.4, color: WARM });
    const wl = walls.find((q) => l.x > q.x0 + 0.4 && l.x < q.x1 - 0.4 && (lz - q.z) * q.n > 0 && (lz - q.z) * q.n < 4.5);
    if (wl) wall.push({ x: l.x, y: l.h * 0.58, z: wl.z + wl.n * 0.04, yaw: wl.n > 0 ? 0 : PI, w: 3.6, h: 4.6, color: WARM });
  }
  for (const wd of L.facade.windows || []) floor.push({ x: (wd.x0 + wd.x1) / 2, z: L.d + 2.3, w: (wd.x1 - wd.x0) * 1.7, d: 4.6, color: [1, 0.86, 0.6] });
  const dr = L.facade.door;
  if (dr) floor.push({ x: (dr.x0 + dr.x1) / 2, z: L.d + 2.4, w: (dr.x1 - dr.x0) * 2.2, d: 4.4, color: [1, 0.86, 0.6] });
  for (const s of neonSources(L)) {
    if (s.id === 'canopy') continue;
    const { nx, nz } = normalOf(s.yaw);
    const k = s.id === 'palast' ? 0.4 : 0.5;
    const col = s.color.map((v) => v * k);
    floor.push({ x: s.x + nx * (1.6 + s.w * 0.3), z: s.z + nz * (1.6 + s.w * 0.3), w: s.w * 1.7, d: Math.max(3, s.w * 1.2), color: col });
    // Wandwäsche nur unterhalb der Schild-Unterkante (sonst überstrahlt sie die Schrift)
    const top = s.y - s.h / 2 - 0.05;
    const hh = Math.max(0.6, Math.min(3.0, top - 0.3));
    wall.push({ x: s.x + nx * 0.05, y: top - hh / 2, z: s.z + nz * 0.05, yaw: s.yaw, w: s.w * 1.35, h: hh, color: col, top });
  }
  return { floor, wall };
}

const STATIC_FIX = new Set(['bench', 'bin', 'bikerack', 'mailbox', 'hydrant', 'phone', 'busstop', 'bollard', 'litfass']);
/** Statische Kontaktschatten: [{ x, z, y, sx, sz, group: 'street'|'shop' }] unter Straßenmöbeln, Regalen und Tresen; optional `parked` (je Auto EIN Rechteck). buildShadows übergibt es nicht, geparkte Autos laufen dort dynamisch (Qualitätswechsel baut sie neu). */
export function staticShadows(L, parked) {
  const out = [];
  const rect = (r, group, k = 1.4, min = 0.7) => {
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    out.push({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, y: 0, sx: Math.max(min, w * k), sz: Math.max(min, d * k), group });
  };
  const c = L.city;
  if (c) {
    for (const f of c.fixtures || []) if (STATIC_FIX.has(f.kind)) rect(f, 'street', 1.7, 0.9);
    for (const r of parked || []) rect(r, 'street', 1.2, 1.0);
  }
  for (const run of L.runs || []) if (run.rect) rect(run.rect, 'shop', 1.15, 0.8);
  if (L.counter) rect(L.counter, 'shop', 1.25, 0.9);
  return out.slice(0, 96);
}

// ---------------------------------------------------------------------------------------------------- Neon

const NEON_VERT = `
attribute vec3 aColor;
attribute vec3 aA;
attribute vec2 aR;
varying vec2 vUv;
varying vec3 vC;
varying vec3 vA;
varying vec2 vR;
void main() {
  vUv = uv; vC = aColor; vA = aA; vR = aR;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const NEON_FRAG = `
uniform sampler2D map;
uniform float uTime;
uniform float uStrength;
uniform float uFlick;
varying vec2 vUv;
varying vec3 vC;
varying vec3 vA;
varying vec2 vR;
void main() {
  float a = texture2D(map, vUv).a;
  // Schildfläche (halbe Ausdehnung als Anteil des Quads in vR): der Schein liegt vor dem Schild und würde die Glyphen überstrahlen, dort stark gedämpft
  vec2 d = abs(vUv - 0.5) * 2.0;
  float inside = (1.0 - smoothstep(vR.x * 0.9, vR.x * 1.08 + 0.001, d.x)) * (1.0 - smoothstep(vR.y * 0.9, vR.y * 1.08 + 0.001, d.y)) * step(0.001, vR.x);
  a *= 1.0 - 0.96 * inside;
  float ph = vA.z;
  float hum = 0.5 + 0.5 * sin(uTime * (2.0 + ph * 1.5) + ph * 40.0);
  float dip = smoothstep(0.93, 1.0, sin(uTime * (1.3 + ph) + ph * 31.0));
  float f = 1.0 - vA.y * uFlick * (0.16 * hum + 0.7 * dip);
  gl_FragColor = vec4(vC, a * uStrength * vA.x * f);
  #include <colorspace_fragment>
}`;

const LAMP_YS = [3.0, 2.84, 2.68]; // rot, gelb, grün (wie world/build-city.js)
const LAMP_RGB = [[1, 0.12, 0.1], [1, 0.78, 0.1], [0.12, 1, 0.3]];
const LAMP_FACE = { mainE: -PI / 2, mainW: PI / 2, sideS: PI, sideN: 0 };
const LAMP_OFF = 0.07;
const PHASES = ['red', 'yellow', 'green'];

/** Ein Quad mit Neon-Attributen (aColor, aA = gain/flick/phase); die Vertexfarbe von quad() wird umbenannt. */
function neonQuad(o, gain, flick, phase, rx = 0, ry = 0) {
  const g = quad(o);
  g.setAttribute('aColor', g.attributes.color);
  g.deleteAttribute('color');
  const a = new Float32Array(12);
  for (let i = 0; i < 4; i++) { a[i * 3] = gain; a[i * 3 + 1] = flick; a[i * 3 + 2] = phase; }
  g.setAttribute('aA', new Float32BufferAttribute(a, 3));
  const r = new Float32Array(8);
  for (let i = 0; i < 4; i++) { r[i * 2] = rx; r[i * 2 + 1] = ry; }
  g.setAttribute('aR', new Float32BufferAttribute(r, 2));
  return g;
}

/**
 * Neon-Halos (zweite, größere Glühebene) für Leuchtschilder + Ampeln: EIN Mesh, Flackern im Shader.
 * @param {object} ctx { use, layout }  @returns {{object, update, dispose}}
 */
export function buildNeon(ctx) {
  const L = ctx.layout;
  const list = [];
  let n = 0;
  for (const s of neonSources(L)) {
    const { nx, nz } = normalOf(s.yaw);
    const stripe = s.id === 'canopy';
    const qw = stripe ? s.w * 1.2 : s.w * 2.1 + 1.0;
    const qh = stripe ? 1.3 : s.h * 3.2 + 1.2;
    list.push(neonQuad({
      w: qw, h: qh, x: s.x + nx * 0.14, y: s.y, z: s.z + nz * 0.14, ry: s.yaw, color: s.color,
    }, stripe ? 0.7 : 0.75, s.flick, ((n++ * 0.6180339) % 1), stripe ? 0 : s.w / qw, stripe ? 0 : s.h / qh));
  }
  const signals = (L.city && L.city.signals) || [];
  const lampBase = n; // Quad-Index der ersten Ampellampe
  for (const s of signals) {
    const ry = LAMP_FACE[s.id] || 0;
    const nx = Math.sin(ry) * (0.14 + LAMP_OFF);
    const nz = Math.cos(ry) * (0.14 + LAMP_OFF);
    LAMP_YS.forEach((y, k) => list.push(neonQuad({ w: 0.8, h: 0.8, x: s.x + nx, y, z: s.z + nz, ry, color: LAMP_RGB[k] }, 0.06, 0, 0)));
  }
  const geo = merge(list);
  const tex = toTexture(glowCanvas(), { mips: false });
  const mat = new ShaderMaterial({
    uniforms: { map: { value: tex }, uTime: { value: 0 }, uStrength: { value: 0 }, uFlick: { value: 1 } },
    vertexShader: NEON_VERT,
    fragmentShader: NEON_FRAG,
    transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, toneMapped: false, fog: false,
  });
  const mesh = new Mesh(geo, mat);
  mesh.name = 'ultra-neon';
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  mesh.matrixAutoUpdate = false;
  const group = new Group();
  group.name = 'ultra-neon-group';
  group.add(mesh);

  // Flackern aus bei prefers-reduced-motion (Vertrag docs/store3d.md, das Basis-Neon macht es ebenso); live über das change-Ereignis
  let mq = null;
  try { mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null; } catch { mq = null; }
  const applyMotion = () => { mat.uniforms.uFlick.value = mq && mq.matches ? 0 : 1; };
  applyMotion();
  if (mq && mq.addEventListener) mq.addEventListener('change', applyMotion);
  let t0 = null; // Zeitbasis ab erstem Update: uTime bleibt klein (float32 im Shader)
  let cur = -1;
  let lastMain = null;
  let lastSide = null;
  let sigAcc = 1;
  function setSignals(sig) {
    if (sig.main === lastMain && sig.side === lastSide) return; // Phasen direkt vergleichen (kein Schlüssel-String pro Frame)
    lastMain = sig.main;
    lastSide = sig.side;
    const attr = geo.attributes.aA;
    signals.forEach((s, i) => {
      const phase = s.signal === 'main' ? sig.main : sig.side;
      PHASES.forEach((name, k) => {
        const q = (lampBase + i * 3 + k) * 4;
        for (let v = 0; v < 4; v++) attr.setX(q + v, phase === name ? 1 : 0.06);
      });
    });
    attr.needsUpdate = true;
  }
  return {
    object: group,
    mesh,
    update(dt, t) {
      const w = weatherOf(ctx);
      const target = neonStrength(w.tod, w.raining) * neonFogFactor(w.fog);
      cur = cur < 0 ? target : lerp(cur, target, dt * 1.5);
      mat.uniforms.uStrength.value = cur;
      if (t0 === null) t0 = t;
      mat.uniforms.uTime.value = shaderTime(t, t0);
      sigAcc += dt;
      if (sigAcc < 0.25) return; // Ampelphasen wechseln im Sekundentakt; wie das Modul city höchstens 4x pro Sekunde lesen
      sigAcc = 0;
      const city = ctx.use && ctx.use('city');
      if (city && typeof city.signals === 'function') { try { setSignals(city.signals()); } catch { /* egal */ } }
    },
    dispose() {
      if (mq && mq.removeEventListener) mq.removeEventListener('change', applyMotion);
      geo.dispose(); mat.dispose(); tex.dispose();
    },
  };
}

// ---------------------------------------------------------------------------------------------------- Pools

/** Weiche additive Decals: Bodenpools + Wandwäsche, nur abends/nachts. EIN Mesh. */
export function buildPools(ctx) {
  const L = ctx.layout;
  const src = poolSources(L);
  const parts = [];
  for (const f of src.floor) parts.push(quad({ w: f.w, h: f.d, x: f.x, y: 0.026, z: f.z, rx: -PI / 2, color: f.color }));
  for (const q of src.wall) parts.push(quad({ w: q.w, h: q.h, x: q.x, y: q.y, z: q.z, ry: q.yaw, color: q.color }));
  const geo = merge(parts);
  const tex = toTexture(glowCanvas(), { mips: false });
  const mat = new MeshBasicMaterial({
    map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, opacity: 0, fog: false, forceSinglePass: true,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false,
  });
  const mesh = new Mesh(geo, mat);
  mesh.name = 'ultra-pools';
  mesh.renderOrder = 6;
  mesh.matrixAutoUpdate = false;
  mesh.visible = false;
  const group = new Group();
  group.name = 'ultra-pools-group';
  group.add(mesh);
  let cur = -1;
  return {
    object: group,
    mesh,
    update(dt) {
      const w = weatherOf(ctx);
      const target = poolStrength(w.tod) * 0.24 * poolSnowFactor(w.cover);
      cur = cur < 0 ? target : lerp(cur, target, dt * 1.5);
      mat.opacity = cur;
      mesh.visible = cur > 0.01;
    },
    dispose() { geo.dispose(); mat.dispose(); tex.dispose(); },
  };
}

// ---------------------------------------------------------------------------------------------------- Schatten

function shadowCanvas() {
  const c = makeCanvas(64, 64);
  const x = c.getContext('2d');
  if (!x) return c;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,0.9)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.6)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return c;
}

export const SHADOW_DYN_MAX = 56;
export const SHADOW_PARKED_MAX = 4; // geparkte Autos (traffic: höchstens 3 Stellplätze)
export const SHADOW_FAR = 30;
const FLOOR_Y = 0.03;
const ALL_VISIBLE = { street: true, shopShell: true };

function shown(o) {
  for (let p = o; p; p = p.parent) if (p.visible === false) return false;
  return true;
}

/**
 * Kontaktschatten: EIN InstancedMesh (= 1 Draw-Call; statische + geparkte + dynamische Blobs; Passanten, Personal, Rowdys, fahrende Autos, Mitspieler, eigene Figur in der Außenansicht).
 * Statische sind nach Gruppe (street/shop) nur sichtbar, wenn die Gruppe gezeichnet wird; geparkte Autos (ein Blob je Auto, Provider traffic.parkedCars, jedes Update neu gelesen)
 * und fahrende Autos hängen ebenfalls an der Straßengruppe; Rest dynamisch alle 2 Frames aus den Providern.
 * Weggelassen: Katze/Tauben (keine Positionsliste im Provider), Rollen/Fahrräder ohne Provider sowie alles jenseits SHADOW_DYN_MAX bzw. SHADOW_FAR.
 */
export function buildShadows(ctx) {
  const L = ctx.layout;
  const tr = ctx.use && ctx.use('traffic');
  const parkedNow = () => {
    try {
      if (tr && typeof tr.parkedCars === 'function') return tr.parkedCars() || [];
      return tr && typeof tr.parked === 'function' ? tr.parked() || [] : [];
    } catch { return []; }
  };
  const stat = staticShadows(L, null);
  const cap = stat.length + SHADOW_PARKED_MAX + SHADOW_DYN_MAX;
  const geo = new PlaneGeometry(1, 1);
  geo.rotateX(-PI / 2);
  const tex = toTexture(shadowCanvas(), { mips: false });
  const mat = new MeshBasicMaterial({
    map: tex, color: 0x000000, transparent: true, depthWrite: false, opacity: 0.4, fog: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new InstancedMesh(geo, mat, cap);
  mesh.name = 'ultra-shadows';
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.count = 0;
  const arr = mesh.instanceMatrix.array;
  // Matrix (Spalten-Hauptordnung) für Translation + Skalierung auf XZ, ohne Drehung (Autos liegen achsparallel)
  const put = (i, x, y, z, sx, sz) => {
    const o = i * 16;
    arr[o] = sx; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0;
    arr[o + 4] = 0; arr[o + 5] = 1; arr[o + 6] = 0; arr[o + 7] = 0;
    arr[o + 8] = 0; arr[o + 9] = 0; arr[o + 10] = sz; arr[o + 11] = 0;
    arr[o + 12] = x; arr[o + 13] = y + FLOOR_Y; arr[o + 14] = z; arr[o + 15] = 1;
  };
  const group = new Group();
  group.name = 'ultra-shadows-group';
  group.add(mesh);

  const src = L.cidx ? { index: L.cidx, dyn: L.dyn } : L.colliders || [];
  const lanes = new Map(((L.city && L.city.lanes) || []).map((l) => [l.id, l]));
  const wp = new Vector3();
  let frame = 0;
  let op = -1;
  const near = (x, z) => { const c = ctx.camera && ctx.camera.position; return !c || Math.hypot(x - c.x, z - c.z) < SHADOW_FAR; };

  function rebuild() {
    const city = ctx.use && ctx.use('city');
    const vis = city && typeof city.visibleRef === 'function' ? city.visibleRef() : city && typeof city.visible === 'function' ? city.visible() : ALL_VISIBLE;
    let i = 0;
    for (const s of stat) {
      if (s.group === 'street' ? !vis.street : !vis.shopShell) continue;
      put(i++, s.x, s.y, s.z, s.sx, s.sz);
    }
    if (vis.street) {
      const parked = parkedNow();
      for (let pi = 0, pn = Math.min(parked.length, SHADOW_PARKED_MAX); pi < pn; pi++) {
        const r = parked[pi];
        put(i++, (r.x0 + r.x1) / 2, 0, (r.z0 + r.z1) / 2, Math.max(1.0, (r.x1 - r.x0) * 1.2), Math.max(1.0, (r.z1 - r.z0) * 1.2));
      }
    }
    let d = 0;
    // y = Fußhöhe: der Blob bleibt auf dem Boden (Standfläche unter den Füßen) und schrumpft mit der Höhe darüber (Sprung)
    const add = (x, y, z, sx, sz) => {
      if (d >= SHADOW_DYN_MAX || !Number.isFinite(x + y + z) || !near(x, z)) return;
      let gy = 0;
      if (y > 0.08) { try { gy = groundHeight(x, z, 0, y, src).y; } catch { gy = 0; } }
      const k = airShadowScale(y - gy);
      if (k <= 0) return;
      put(i + d, x, gy, z, sx * k, sz * k);
      d++;
    };
    const npc = ctx.use && ctx.use('npc');
    if (npc && typeof npc.people === 'function') {
      for (const p of npc.people()) {
        if (p.kind === 'peer') continue; // Mitspieler laufen über net.peerPositions() (sonst doppelter Schatten)
        const r = p.handle && p.handle.root;
        if (!r || !shown(r)) continue;
        add(p.x, r.position.y || 0, p.z, 1.1, 1.1);
      }
    }
    if (tr && typeof tr.cars === 'function') {
      for (const c of tr.cars()) {
        if (!vis.street || c.state === 'away') continue;
        const ln = lanes.get(c.lane);
        const alongX = !ln || !ln.dir || Math.abs(ln.dir.x) > 0;
        add(c.x, 0, c.z, alongX ? CAR_LEN * 1.15 : CAR_W * 1.3, alongX ? CAR_W * 1.3 : CAR_LEN * 1.15);
      }
    }
    const net = ctx.use && ctx.use('net');
    if (net && typeof net.peerPositions === 'function') {
      for (const p of net.peerPositions()) if (p) add(p.x, p.y || 0, p.z, 1.1, 1.1);
    }
    const sv = ctx.use && ctx.use('selfview');
    if (sv && typeof sv.mode === 'function' && sv.mode() === 'third' && typeof sv.figure === 'function') {
      const f = sv.figure();
      if (f && f.root && shown(f.root)) { f.root.getWorldPosition(wp); add(wp.x, wp.y, wp.z, 1.1, 1.1); }
    }
    mesh.count = i + d;
    mesh.instanceMatrix.needsUpdate = true;
  }

  return {
    object: group,
    mesh,
    staticCount: stat.length,
    update(dt) {
      const w = weatherOf(ctx);
      const target = shadowOpacity(w.tod, w.raining);
      op = op < 0 ? target : lerp(op, target, dt * 1.5);
      mat.opacity = op;
      if ((frame++ & 1) === 0) rebuild();
    },
    dispose() { geo.dispose(); mat.dispose(); tex.dispose(); mesh.dispose(); },
  };
}
