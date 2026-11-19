// VIDEOTHEK LENZ · Niederschlag (1.19.0): Regen und Schnee als EINE Geometrie (N Quads) mit EINEM ShaderMaterial = 1 Draw-Call, auch auf low.
// Die ganze Animation läuft im Vertex-Shader über Uniforms (Zeit, Kameraposition, Wind): keine Buffer-Uploads pro Frame. Das Volumen
// (24 x 24 m, Kamera-6 … Kamera+10 m) wird per mod() um die Kamera gewickelt, die Partikel stehen also in der Welt, nicht an der Kamera.
// Provider 'precip' { setWeather({ kind: 'rain'|'snow'|null, i: 0..1 }), current() }. Schutzboxen (Laden, Palast, Salon, Vordach, Kiosk)
// lassen Partikel darunter verschwinden. Sichtbar nur, wenn der Spieler in einem Außenbereich ist oder die Kamera draußen (Intro).
// Logik/Konstanten: weather/precip-logic.js.
import {
  Mesh, BufferGeometry, BufferAttribute, ShaderMaterial, DoubleSide, Vector2, Vector3, Vector4,
} from 'three';
import { rng } from '../util/geo.js';
import { presetFor } from '../engine/quality.js';
import { OUTDOOR_AREAS } from '../world/city.js';
import { clamp, prefersReducedMotion } from './m4-util.js';
import { scheduleWarm } from '../engine/warm.js';
import {
  HALF, Y_BELOW, Y_ABOVE, MAX_BOXES, KINDS, normalizeWeather, countFor, stepBlend, shelterBoxes, packBoxes, calmFor, shaderTime,
} from '../weather/precip-logic.js';

const VERT = /* glsl */ `
uniform float uTime;
uniform float uHalf;
uniform float uYLo;
uniform float uYSpan;
uniform vec2 uWind;
uniform vec2 uFall;
uniform float uLen;
uniform float uWidth;
uniform float uSize;
uniform float uKind;
uniform float uSway;
uniform float uAlpha;
uniform vec3 uCam;
uniform vec4 uBoxA[${MAX_BOXES}];
uniform float uBoxY[${MAX_BOXES}];
attribute vec4 aSeed;
attribute vec2 aCorner;
varying vec2 vC;
varying float vA;
void main() {
  float span = 2.0 * uHalf;
  float fall = mix(uFall.x, uFall.y, aSeed.w);
  vec3 vel = vec3(uWind.x, -fall, uWind.y);
  vec3 raw = aSeed.xyz * vec3(span, uYSpan, span) + vel * uTime;
  vec3 rel = vec3(
    mod(raw.x - uCam.x + uHalf, span) - uHalf,
    mod(raw.y - (uCam.y + uYLo), uYSpan),
    mod(raw.z - uCam.z + uHalf, span) - uHalf);
  vec3 p = vec3(uCam.x + rel.x, uCam.y + uYLo + rel.y, uCam.z + rel.z);
  if (uKind > 0.5) {
    p.x += sin(uTime * 0.8 + aSeed.x * 40.0) * 0.25 * uSway;
    p.z += cos(uTime * 0.6 + aSeed.z * 40.0) * 0.25 * uSway;
  }
  // Schutz: unter Dach (Box) verschwindet das Partikel (alle vier Ecken außerhalb des Clip-Raums)
  for (int i = 0; i < ${MAX_BOXES}; i++) {
    vec4 b = uBoxA[i];
    if (p.x > b.x && p.x < b.z && p.z > b.y && p.z < b.w && p.y < uBoxY[i]) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      vA = 0.0;
      vC = vec2(0.0);
      return;
    }
  }
  float dxz = length(rel.xz);
  float edge = 1.0 - smoothstep(uHalf * 0.55, uHalf, dxz);
  float yEdge = smoothstep(0.0, 1.0, rel.y) * (1.0 - smoothstep(uYSpan - 1.5, uYSpan, rel.y));
  vec3 toP = p - cameraPosition;
  float dist = length(toP);
  float nearF = smoothstep(0.3, 1.1, dist);
  float bright = 0.6 + 0.4 * fract(aSeed.w * 7.31 + aSeed.x * 3.7);
  vA = uAlpha * edge * yEdge * nearF * bright;
  if (uKind < 0.5) {
    vec3 axis = normalize(vel);
    vec3 cr = cross(axis, toP / max(dist, 0.001));
    vec3 side = length(cr) > 0.001 ? normalize(cr) : vec3(1.0, 0.0, 0.0);
    float w = max(uWidth, dist * 0.0026);
    float along = (aCorner.y + 1.0) * 0.5;
    vec3 wp = p + side * (aCorner.x * w * 0.5) - axis * (along * uLen);
    vA *= clamp(uWidth / w, 0.45, 1.0);
    vC = vec2(aCorner.x, along);
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  } else {
    vec4 mv = viewMatrix * vec4(p, 1.0);
    float s = max(uSize, dist * 0.0025) * (0.7 + 0.6 * bright);
    mv.xy += aCorner * s;
    vC = aCorner;
    gl_Position = projectionMatrix * mv;
  }
}
`;

const FRAG = /* glsl */ `
uniform float uKind;
varying vec2 vC;
varying float vA;
void main() {
  float a;
  vec3 col;
  if (uKind < 0.5) {
    float tail = 1.0 - vC.y;
    a = smoothstep(0.0, 0.12, vC.y) * tail * tail * (1.0 - vC.x * vC.x);
    col = vec3(0.70, 0.80, 1.0);
  } else {
    a = 1.0 - smoothstep(0.35, 1.0, length(vC));
    col = vec3(0.96, 0.98, 1.0);
  }
  float o = a * vA;
  if (o < 0.004) discard;
  gl_FragColor = vec4(col, o);
}
`;

/** Wachsende Partikel-Geometrie: n Quads (4 Ecken, 6 Indizes), aSeed = Zufall (x,y,z,w), aCorner = Ecke (-1/1). */
export function buildPrecipGeometry(n, seed = 77) {
  const r = rng(seed);
  const seeds = new Float32Array(n * 16);
  const corners = new Float32Array(n * 8);
  const index = new Uint16Array(n * 6);
  const C = [-1, -1, 1, -1, 1, 1, -1, 1];
  for (let i = 0; i < n; i++) {
    const s = [r(), r(), r(), r()];
    for (let c = 0; c < 4; c++) {
      seeds.set(s, i * 16 + c * 4);
      corners.set([C[c * 2], C[c * 2 + 1]], i * 8 + c * 2);
    }
    const b = i * 4;
    index.set([b, b + 1, b + 2, b, b + 2, b + 3], i * 6);
  }
  const g = new BufferGeometry();
  g.setAttribute('aSeed', new BufferAttribute(seeds, 4));
  g.setAttribute('aCorner', new BufferAttribute(corners, 2));
  g.setIndex(new BufferAttribute(index, 1));
  g.setDrawRange(0, 0);
  return g;
}

export default {
  name: 'precip',
  init(ctx) {
    const phone = !!ctx.isPhone;
    const maxN = Math.max(...['low', 'mid', 'high', 'ultra'].map((lv) => presetFor(lv, phone).precip || 0));
    const geo = buildPrecipGeometry(maxN);
    const boxes = shelterBoxes(ctx.layout);
    const packed = packBoxes(boxes);
    const boxA = Array.from({ length: MAX_BOXES }, (_, i) => new Vector4(packed.xz[i * 4], packed.xz[i * 4 + 1], packed.xz[i * 4 + 2], packed.xz[i * 4 + 3]));
    const boxY = Array.from(packed.y);
    const U = {
      uTime: { value: 0 },
      uHalf: { value: HALF },
      uYLo: { value: -Y_BELOW },
      uYSpan: { value: Y_BELOW + Y_ABOVE },
      uWind: { value: new Vector2(1.1, 0.4) },
      uFall: { value: new Vector2(KINDS.rain.fallMin, KINDS.rain.fallMax) },
      uLen: { value: 0.5 },
      uWidth: { value: 0.024 },
      uSize: { value: 0.035 },
      uKind: { value: 0 },
      uSway: { value: 1 },
      uAlpha: { value: 0 },
      uCam: { value: new Vector3() },
      uBoxA: { value: boxA },
      uBoxY: { value: boxY },
    };
    const mat = new ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: DoubleSide, fog: false });
    const mesh = new Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 8;
    mesh.matrixAutoUpdate = false;
    mesh.visible = false;
    ctx.scene.add(mesh);
    ctx.track(mesh); ctx.track(geo); ctx.track(mat);

    const st = { kind: null, a: 0 };
    let want = { kind: null, i: 0 };
    let first = true;
    let level = ctx.quality();
    let near = false;
    let suspended = false;
    let checkT = 0;
    let t0 = null; // Zeitbasis ab erstem Update: uTime = Szenenzeit statt Seitenlaufzeit (float32-Auflösung im Shader bleibt fein)
    const cam = ctx.camera;
    const wp = new Vector3();
    const D = ctx.layout.d;

    // Reduzierte Bewegung: ruhiger (langsamer, kürzere Streifen, kein Pendeln), nicht abgeschaltet; live über das change-Ereignis
    let calm = calmFor(prefersReducedMotion());
    let curKind = null;
    let mq = null;
    try { mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null; } catch { mq = null; }
    function applyKind(k) {
      const K = KINDS[k] || KINDS.rain;
      curKind = k;
      U.uKind.value = K.id;
      U.uFall.value.set(K.fallMin * calm.fall, K.fallMax * calm.fall);
      const wx = k === 'snow' ? 0.35 : 1.1;
      const wz = k === 'snow' ? 0.15 : 0.4;
      U.uWind.value.set(wx * calm.wind, wz * calm.wind);
      U.uLen.value = 0.5 * calm.len;
      U.uSway.value = calm.sway;
    }
    const onMotion = () => { calm = calmFor(prefersReducedMotion()); if (curKind) applyKind(curKind); };
    if (mq && mq.addEventListener) mq.addEventListener('change', onMotion);
    function setWeather(w) {
      want = normalizeWeather(w);
      if (first) { first = false; st.kind = want.kind; st.a = want.i; } // erster Wert gilt sofort, Änderungen blenden weich
    }

    const provider = {
      setWeather,
      /** Aktuell gezeigte Art/Stärke und das Ziel (Tests, Debug). */
      current() { return { kind: st.kind, a: st.a, want: { ...want }, near, visible: mesh.visible, count: geo.drawRange.count / 6 }; },
    };
    ctx.provide('precip', provider);
    if (ctx.opts && ctx.opts.debug) window.__lfxM4 = { ...window.__lfxM4, precip: () => provider.current() };

    function refresh(t) {
      if (t - checkT > 0.4) {
        checkT = t;
        const areas = ctx.use('areas');
        const a = areas ? areas.current() : 'shop';
        near = OUTDOOR_AREAS.includes(a) || (a !== 'palastHall' && a !== 'palastFoyer' && a !== 'salon' && cam.position.z > D + 0.3); // Kamera draußen (Intro) oder Spieler in einem Außenbereich
      }
    }

    // Das Programm (Regen und Schnee teilen es, Art per Uniform) vor dem ersten Niederschlag im Leerlauf kompilieren
    const cancelWarm = scheduleWarm(ctx, () => [{ object: mesh }]);

    return {
      update(dt, t) {
        refresh(t);
        stepBlend(st, want, clamp(dt, 0, 0.25));
        const vis = st.kind !== null && st.a > 0.001 && near && !suspended;
        if (!vis) { if (mesh.visible) mesh.visible = false; return; }
        const n = countFor(presetFor(level, phone).precip, st.a);
        if (!n) { mesh.visible = false; return; }
        if (curKind !== st.kind) applyKind(st.kind);
        cam.getWorldPosition(wp);
        U.uCam.value.copy(wp);
        if (t0 === null) t0 = t;
        U.uTime.value = shaderTime(t, t0);
        U.uAlpha.value = KINDS[st.kind].alpha * (0.5 + 0.5 * Math.min(1, st.a));
        geo.setDrawRange(0, n * 6);
        mesh.visible = true;
      },
      onQuality(lv) { level = lv; },
      onSuspend() { suspended = true; mesh.visible = false; },
      onResume() { suspended = false; },
      dispose() { cancelWarm(); if (mq && mq.removeEventListener) mq.removeEventListener('change', onMotion); if (window.__lfxM4) delete window.__lfxM4.precip; },
    };
  },
};
