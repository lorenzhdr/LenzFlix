// VIDEOTHEK LENZ · Nasse Straße (Ultra, 1.19.0): Registrierung 'wet' beim Provider 'ultra' (engine/ultra.js), nur neue Datei.
// Bei Regen (und 10 min danach, bei Schnee nie) erscheinen (1) gestreckte additive Spiegelstreifen unter Laternen, Schaufenstern, Tür, Palast und
// Kiosk, die per Vertex-Shader zur Kamera zeigen, und (2) dunkle Pfützen-Decals auf Straße und Gehweg. Höchstens 2 Draw-Calls, nur wenn nass.
// Stärke aus weather.i (wetLevel), nachts deutlich, tagsüber dezent (wetGlow). Quelle: Provider 'weather' (modules/daytime.js).
import {
  Group, Mesh, BufferGeometry, BufferAttribute, ShaderMaterial, MeshBasicMaterial, AdditiveBlending, DoubleSide, Vector3,
} from 'three';
import { makeCanvas, toTexture } from '../world/textures.js';
import { rng } from '../util/geo.js';
import { wetLevel, wetGlow, WET_DRY_S } from '../weather/fx-logic.js';

const VERT = /* glsl */ `
uniform vec3 uCam;
attribute vec3 aCenter;
attribute vec2 aOff;
attribute vec3 aCol;
varying vec2 vUv;
varying vec3 vCol;
void main() {
  vec2 d = aCenter.xz - uCam.xz;
  float l = length(d);
  d = l > 0.001 ? d / l : vec2(0.0, 1.0);
  vec2 perp = vec2(-d.y, d.x);
  vec2 xz = aCenter.xz - d * aOff.y + perp * aOff.x;
  vUv = uv;
  vCol = aCol;
  gl_Position = projectionMatrix * viewMatrix * vec4(xz.x, aCenter.y, xz.y, 1.0);
}
`;
const FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uA;
varying vec2 vUv;
varying vec3 vCol;
void main() {
  float a = texture2D(uMap, vUv).a * uA;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vCol, a); // Additiv: three multipliziert mit alpha
}
`;

function streakCanvas() {
  const c = makeCanvas(32, 128);
  const x = c.getContext('2d');
  for (let j = 0; j < 128; j++) {
    const t = j / 127; // 0 = Lichtquelle (unten im UV), 1 = Ende
    for (let i = 0; i < 32; i++) {
      const u = Math.abs(i / 31 - 0.5) * 2;
      const a = Math.max(0, 1 - u * u) * Math.max(0, 1 - t) ** 1.6;
      x.fillStyle = `rgba(255,255,255,${(a * 0.85).toFixed(3)})`;
      x.fillRect(i, 127 - j, 1, 1);
    }
  }
  return c;
}
function puddleCanvas() {
  const c = makeCanvas(128, 128);
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 8, 64, 64, 62);
  g.addColorStop(0, 'rgba(34,50,92,0.7)');
  g.addColorStop(0.7, 'rgba(26,40,76,0.5)');
  g.addColorStop(1, 'rgba(26,40,76,0)');
  x.fillStyle = g;
  x.beginPath(); x.ellipse(64, 64, 62, 46, 0, 0, Math.PI * 2); x.fill();
  x.strokeStyle = 'rgba(190,210,255,0.22)';
  x.lineWidth = 2;
  x.beginPath(); x.ellipse(64, 64, 48, 33, 0, 0.2, Math.PI * 1.1); x.stroke();
  return c;
}

/** Quellen der Spiegelungen: { x, z, w, len, col } (Laternen, Schaufenster, Tür, Palast-Vordach, Kiosk). */
export function wetSources(layout) {
  const out = [];
  const city = layout.city;
  if (!city) return out;
  for (const l of city.lights || []) out.push({ x: l.x, z: l.z + l.armDz * 0.3, w: 1.0, len: 5.5, col: [1, 0.82, 0.5] });
  const f = layout.facade;
  const zW = layout.d + 0.12 + 1.0;
  if (f) {
    for (const wd of f.windows || []) out.push({ x: (wd.x0 + wd.x1) / 2, z: zW, w: Math.min(2.6, (wd.x1 - wd.x0) * 0.7), len: 4.5, col: [1, 0.86, 0.6] });
    if (f.door) out.push({ x: (f.door.x0 + f.door.x1) / 2, z: zW + 0.2, w: 1.2, len: 4.5, col: [1, 0.86, 0.6] });
  }
  if (city.palast && city.palast.canopy) { const c = city.palast.canopy; out.push({ x: (c.x0 + c.x1) / 2, z: c.z0 - 0.8, w: 2.4, len: 5, col: [1, 0.7, 0.85] }); }
  out.push({ x: layout.w + 10, z: layout.d + 1.4, w: 1.4, len: 4, col: [1, 0.7, 0.9] });
  return out;
}

export function buildWet(ctx) {
  const L = ctx.layout;
  const group = new Group();
  group.name = 'ultra-wet';
  // --- Streifen (1 Draw-Call, der Shader richtet sie zur Kamera aus) ---
  const src = wetSources(L);
  const n = src.length;
  const center = new Float32Array(n * 12);
  const off = new Float32Array(n * 8);
  const col = new Float32Array(n * 12);
  const uv = new Float32Array(n * 8);
  const idx = new Uint16Array(n * 6);
  src.forEach((s, i) => {
    const corners = [[-s.w / 2, -s.len * 0.12, 0, 0], [s.w / 2, -s.len * 0.12, 1, 0], [s.w / 2, s.len, 1, 1], [-s.w / 2, s.len, 0, 1]];
    corners.forEach((c, k) => {
      center.set([s.x, 0.02, s.z], i * 12 + k * 3);
      off.set([c[0], c[1]], i * 8 + k * 2);
      col.set(s.col, i * 12 + k * 3);
      uv.set([c[2], c[3]], i * 8 + k * 2);
    });
    const b = i * 4;
    idx.set([b, b + 1, b + 2, b, b + 2, b + 3], i * 6);
  });
  const sg = new BufferGeometry();
  sg.setAttribute('position', new BufferAttribute(center, 3)); // Platzhalter (der Shader nutzt aCenter)
  sg.setAttribute('aCenter', new BufferAttribute(center, 3));
  sg.setAttribute('aOff', new BufferAttribute(off, 2));
  sg.setAttribute('aCol', new BufferAttribute(col, 3));
  sg.setAttribute('uv', new BufferAttribute(uv, 2));
  sg.setIndex(new BufferAttribute(idx, 1));
  const streakTex = toTexture(streakCanvas(), { aniso: 1 });
  const U = { uCam: { value: new Vector3() }, uMap: { value: streakTex }, uA: { value: 0 } };
  const smat = new ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, fog: false });
  const streaks = new Mesh(sg, smat);
  streaks.frustumCulled = false;
  streaks.renderOrder = 7;
  streaks.visible = false;
  if (n) group.add(streaks);

  // --- Pfützen (1 Draw-Call): dunkle Decals auf Fahrbahn und Gehweg ---
  const zones = (L.city && L.city.zones) || {};
  const rects = ['road', 'sidewalkN', 'sidewalkS'].map((k) => zones[k] && zones[k].rect).filter(Boolean);
  const r = rng(4711);
  const pos = [];
  const puv = [];
  const pidx = [];
  const P = 16;
  for (let i = 0; i < P && rects.length; i++) {
    const rc = rects[Math.floor(r() * rects.length)];
    const x = rc.x0 + 6 + r() * Math.max(1, rc.x1 - rc.x0 - 12);
    const z = rc.z0 + 0.8 + r() * Math.max(0.5, rc.z1 - rc.z0 - 1.6);
    const w = 1.2 + r() * 2.2;
    const h = w * (0.5 + r() * 0.3);
    const a = r() * Math.PI;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const b = pos.length / 3;
    for (const [px, pz, u, v] of [[-w / 2, -h / 2, 0, 0], [w / 2, -h / 2, 1, 0], [w / 2, h / 2, 1, 1], [-w / 2, h / 2, 0, 1]]) {
      pos.push(x + px * ca - pz * sa, 0.012, z + px * sa + pz * ca);
      puv.push(u, v);
    }
    pidx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  }
  const pg = new BufferGeometry();
  pg.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  pg.setAttribute('uv', new BufferAttribute(new Float32Array(puv), 2));
  pg.setIndex(new BufferAttribute(new Uint16Array(pidx), 1));
  const puddleTex = toTexture(puddleCanvas(), { aniso: 1 });
  const pmat = new MeshBasicMaterial({ map: puddleTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, opacity: 0, fog: false });
  const puddles = new Mesh(pg, pmat);
  puddles.frustumCulled = false;
  puddles.renderOrder = 6;
  puddles.visible = false;
  if (pidx.length) group.add(puddles);

  let lastRain = null; // Zeitpunkt (s) des letzten Regenendes
  let wasRaining = false;
  let amount = 0;
  const cam = new Vector3();
  return {
    object: group,
    update(dt, t) {
      const w = ctx.use('weather');
      if (!w) return;
      if (w.raining) { wasRaining = true; lastRain = null; } else if (wasRaining) { wasRaining = false; lastRain = t; }
      // Regenende führt der Provider (läuft in jeder Stufe); lokale Führung nur als Rückfall ohne sinceWet
      const since = typeof w.sinceWet === 'function' ? w.sinceWet() : w.raining ? 0 : lastRain === null ? null : t - lastRain;
      const target = wetLevel(w, since);
      amount += (target - amount) * Math.min(1, dt * 0.8); // weich ein- und ausblenden
      const vis = amount > 0.01;
      streaks.visible = vis && n > 0;
      puddles.visible = vis && pidx.length > 0;
      if (!vis) return;
      ctx.camera.getWorldPosition(cam);
      U.uCam.value.copy(cam);
      U.uA.value = Math.min(1, amount * wetGlow(w.tod) * 1.1);
      pmat.opacity = Math.min(1, amount * (w.tod === 'day' ? 0.5 : 0.75));
    },
    dispose() {
      sg.dispose(); smat.dispose(); streakTex.dispose(); pg.dispose(); pmat.dispose(); puddleTex.dispose();
    },
    dryAfter: WET_DRY_S,
  };
}

export default {
  name: 'ultra-wet',
  init(ctx) {
    const u = ctx.use('ultra');
    if (!u || typeof u.register !== 'function') return {};
    const city = ctx.use('city');
    const parent = city && city.groups && city.groups.street ? city.groups.street : null;
    const off = u.register('wet', buildWet, parent ? { parent } : {});
    return { dispose() { off(); } };
  },
};
