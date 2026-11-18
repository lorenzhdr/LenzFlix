// VIDEOTHEK LENZ · liegender Schnee (1.19.0): onBeforeCompile-Patch für die getönten Außenmaterialien (outdoor.js out.tint → out.snow.patch).
// Schneeanteil = uSnow * Flächenneigung (aus der Bildschirm-Ableitung der Weltposition, nur nach oben zeigende Flächen) * Fleckenrauschen,
// maskiert in den Schutzboxen (Laden, Palast, Salon, Kiosk; gleiche Boxen wie der fallende Niederschlag). Das Uniform ist immer vorhanden
// und der Cache-Schlüssel fest: ein Wetterwechsel ändert nur Uniform-Werte und löst KEIN Neukompilieren aus.
// Nicht für Figuren-Materialien (geteiltes Figurenmaterial) und nicht für Innenräume gedacht: nur out.tint-Materialien.
import { Vector3, Vector4 } from 'three';
import { MAX_BOXES, packBoxes, shelterBoxes } from './precip-logic.js';

export const SNOW_KEY = 'lfx-snow-v1';

const VERT_DECL = `
varying vec3 vLfxWp;`;
const VERT_BODY = `
  vec4 lfxW = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  lfxW = instanceMatrix * lfxW;
  #endif
  vLfxWp = (modelMatrix * lfxW).xyz;`;
const FRAG_DECL = `
varying vec3 vLfxWp;
uniform float uSnow;
uniform vec3 uSnowCol;
uniform vec4 uSnowBoxA[${MAX_BOXES}];
uniform float uSnowBoxY[${MAX_BOXES}];
float lfxHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float lfxNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(lfxHash(i), lfxHash(i + vec2(1.0, 0.0)), f.x), mix(lfxHash(i + vec2(0.0, 1.0)), lfxHash(i + vec2(1.0, 1.0)), f.x), f.y);
}`;
const FRAG_BODY = `
  if (uSnow > 0.001) {
    vec3 lfxN = normalize(cross(dFdx(vLfxWp), dFdy(vLfxWp)));
    if (dot(lfxN, cameraPosition - vLfxWp) < 0.0) lfxN = -lfxN;
    float lfxUp = smoothstep(0.55, 0.9, lfxN.y);
    float lfxNz = lfxNoise(vLfxWp.xz * 1.7) * 0.6 + lfxNoise(vLfxWp.xz * 5.3) * 0.4;
    float lfxThr = 0.95 - uSnow * 1.05;
    float lfxCov = smoothstep(lfxThr - 0.12, lfxThr + 0.12, lfxNz);
    float lfxMask = 1.0;
    for (int i = 0; i < ${MAX_BOXES}; i++) {
      vec4 b = uSnowBoxA[i];
      if (vLfxWp.x > b.x && vLfxWp.x < b.z && vLfxWp.z > b.y && vLfxWp.z < b.w && vLfxWp.y < uSnowBoxY[i] - 0.05) lfxMask = 0.0;
    }
    outgoingLight = mix(outgoingLight, uSnowCol, lfxUp * lfxCov * lfxMask * 0.96);
  }`;

/** Patcht Vertex- und Fragment-Quelltext (Strings) eines Standard-Materials (z. B. ShaderLib.basic). Rein, testbar. */
export function patchSnowSource(vertexShader, fragmentShader) {
  const v = vertexShader
    .replace('#include <common>', `#include <common>${VERT_DECL}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>${VERT_BODY}`);
  const f = fragmentShader
    .replace('#include <common>', `#include <common>${FRAG_DECL}`)
    .replace('#include <opaque_fragment>', `${FRAG_BODY}\n  #include <opaque_fragment>`);
  return { vertexShader: v, fragmentShader: f };
}

/** Ein gemeinsamer Schnee-Zustand je Szene: { u (Uniforms), patch(mat) → mat, set(cover, rgb) }. */
export function createSnow(layout) {
  const packed = packBoxes(shelterBoxes(layout));
  const u = {
    uSnow: { value: 0 },
    uSnowCol: { value: new Vector3(0.95, 0.97, 1) },
    uSnowBoxA: { value: Array.from({ length: MAX_BOXES }, (_, i) => new Vector4(packed.xz[i * 4], packed.xz[i * 4 + 1], packed.xz[i * 4 + 2], packed.xz[i * 4 + 3])) },
    uSnowBoxY: { value: Array.from(packed.y) },
  };
  return {
    u,
    patch(mat) {
      if (!mat || mat.userData.lfxSnow) return mat;
      mat.userData.lfxSnow = true;
      const prev = Object.prototype.hasOwnProperty.call(mat, 'onBeforeCompile') && typeof mat.onBeforeCompile === 'function' ? mat.onBeforeCompile : null; // eigenes Fremd-Hook bleibt erhalten
      mat.onBeforeCompile = function (sh, renderer) {
        if (prev) prev.call(this, sh, renderer);
        Object.assign(sh.uniforms, u);
        const r = patchSnowSource(sh.vertexShader, sh.fragmentShader);
        sh.vertexShader = r.vertexShader;
        sh.fragmentShader = r.fragmentShader;
      };
      const own = Object.prototype.hasOwnProperty.call(mat, 'customProgramCacheKey') ? mat.customProgramCacheKey : null;
      mat.customProgramCacheKey = own ? () => `${own.call(mat)}|${SNOW_KEY}` : () => SNOW_KEY;
      return mat;
    },
    /** cover 0..1 (liegender Schnee) und Schneefarbe (rgb 0..1, aus der Palette). Nur Uniform-Werte. */
    set(cover, rgb) {
      u.uSnow.value = cover > 0 ? Math.min(1, cover) : 0;
      if (rgb) u.uSnowCol.value.set(rgb[0], rgb[1], rgb[2]);
    },
  };
}
