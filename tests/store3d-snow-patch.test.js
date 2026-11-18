// @vitest-environment jsdom
// VIDEOTHEK LENZ · liegender Schnee (1.19.0): onBeforeCompile-Patch gegen die echte ShaderLib aus three, fester Cache-Schlüssel, nur out.tint-Materialien.
import { describe, it, expect, afterEach } from 'vitest';
import { MeshBasicMaterial, ShaderLib, Scene } from 'three';
import { createSnow, patchSnowSource, SNOW_KEY } from '../src/js/store3d/weather/snow-patch.js';
import { MAX_BOXES } from '../src/js/store3d/weather/precip-logic.js';
import { buildLayout } from '../src/js/store3d/world/layout.js';
import { getOutdoor } from '../src/js/store3d/modules/outdoor.js';
import { makeLook } from '../src/js/store3d/npc/looks.js';
import { createFigure } from '../src/js/store3d/npc/figure.js';

const layout = () => buildLayout([{ id: 'new', label: 'Neuheiten', kind: 'new', color: '#f00', itemIds: [] }]);

function compileFake(mat) {
  const sh = { uniforms: {}, vertexShader: ShaderLib.basic.vertexShader, fragmentShader: ShaderLib.basic.fragmentShader };
  mat.onBeforeCompile(sh, {});
  return sh;
}

describe('Schnee-Patch', () => {
  it('ShaderLib.basic enthält die Einhängepunkte', () => {
    for (const k of ['#include <common>', '#include <begin_vertex>']) expect(ShaderLib.basic.vertexShader).toContain(k);
    for (const k of ['#include <common>', '#include <opaque_fragment>']) expect(ShaderLib.basic.fragmentShader).toContain(k);
  });

  it('patchSnowSource: Weltposition als varying, Ableitungs-Normale, Uniform, Instancing, Masken', () => {
    const r = patchSnowSource(ShaderLib.basic.vertexShader, ShaderLib.basic.fragmentShader);
    expect(r.vertexShader).toContain('varying vec3 vLfxWp');
    expect(r.vertexShader).toContain('instanceMatrix');
    expect(r.vertexShader).toContain('modelMatrix');
    expect(r.fragmentShader).toContain('uniform float uSnow');
    expect(r.fragmentShader).toContain('dFdx(vLfxWp)');
    expect(r.fragmentShader).toContain('smoothstep(0.55, 0.9');
    expect(r.fragmentShader).toContain(`uSnowBoxA[${MAX_BOXES}]`);
    // Schnee wird vor opaque_fragment gemischt (outgoingLight), das Include bleibt erhalten
    expect(r.fragmentShader.indexOf('uSnowCol, lfxUp')).toBeLessThan(r.fragmentShader.indexOf('#include <opaque_fragment>'));
    expect(r.vertexShader).not.toBe(ShaderLib.basic.vertexShader);
  });

  it('patch: Uniforms eingehängt, fester Cache-Schlüssel, Wetterwechsel ändert nur Werte', () => {
    const snow = createSnow(layout());
    const a = snow.patch(new MeshBasicMaterial({ vertexColors: true }));
    const b = snow.patch(new MeshBasicMaterial());
    const sh = compileFake(a);
    for (const k of ['uSnow', 'uSnowCol', 'uSnowBoxA', 'uSnowBoxY']) expect(sh.uniforms[k], k).toBe(snow.u[k]);
    expect(sh.fragmentShader).toContain('uSnow');
    expect(a.customProgramCacheKey()).toBe(SNOW_KEY);
    expect(b.customProgramCacheKey()).toBe(a.customProgramCacheKey());
    const k0 = a.customProgramCacheKey();
    const src0 = compileFake(a).fragmentShader;
    snow.set(1, [0.9, 0.9, 1]);
    expect(snow.u.uSnow.value).toBe(1);
    snow.set(0, null);
    expect(snow.u.uSnow.value).toBe(0);
    expect(a.customProgramCacheKey()).toBe(k0);
    expect(compileFake(a).fragmentShader).toBe(src0); // Quelltext hängt nicht vom Wetter ab → kein Neukompilieren
  });

  it('doppelter patch ist wirkungslos; vorhandenes onBeforeCompile bleibt erhalten', () => {
    const snow = createSnow(layout());
    let called = 0;
    const m = new MeshBasicMaterial();
    m.onBeforeCompile = () => { called++; };
    snow.patch(m);
    snow.patch(m);
    compileFake(m);
    expect(called).toBe(1);
    expect(m.fragmentShader).toBeUndefined();
  });

  it('Masken-Boxen stammen aus den Schutzboxen (Laden zuerst) und sind immer MAX_BOXES lang', () => {
    const snow = createSnow(layout());
    expect(snow.u.uSnowBoxA.value.length).toBe(MAX_BOXES);
    expect(snow.u.uSnowBoxY.value.length).toBe(MAX_BOXES);
    expect(snow.u.uSnowBoxA.value[0].z).toBeGreaterThan(0);
    expect(snow.u.uSnowBoxY.value[0]).toBeGreaterThan(0);
  });
});

describe('nur out.tint-Materialien', () => {
  const realGetContext = HTMLCanvasElement.prototype.getContext;
  afterEach(() => { HTMLCanvasElement.prototype.getContext = realGetContext; });
  const proxyCtx = () => new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (k === 'measureText' ? () => ({ width: 10 }) : () => ({ addColorStop() {} }))),
    set: (t, k, v) => { t[k] = v; return true; },
  });

  it('out.tint patcht, ein ungetöntes Material und Figuren-Materialien nicht', () => {
    HTMLCanvasElement.prototype.getContext = proxyCtx;
    const L = layout();
    const scene = new Scene();
    const out = getOutdoor({ scene, layout: L, track: (o) => o });
    const t = out.tint(new MeshBasicMaterial());
    const plain = new MeshBasicMaterial();
    expect(t.userData.lfxSnow).toBe(true);
    expect(plain.userData.lfxSnow).toBeUndefined();
    expect(out.snow.u.uSnow.value).toBe(0);
    // Setzen der Palette mit liegendem Schnee: nur Uniform-Werte, Schneefarbe nie ganz weiß bei Nacht
    out.setPalette('night', false, { overcast: true, fog: 0, snowing: false, cover: 1, wet: false });
    expect(out.snow.u.uSnow.value).toBe(1);
    expect(out.snow.u.uSnowCol.value.x).toBeLessThan(0.97);
    expect(out.snow.u.uSnowCol.value.z).toBeGreaterThan(out.snow.u.uSnowCol.value.x); // bläulich
    out.setPalette('day', false, { cover: 0 });
    expect(out.snow.u.uSnow.value).toBe(0);
    const fig = createFigure(makeLook(() => 0.4), {});
    const mats = new Set();
    fig.root.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m)); });
    expect(mats.size).toBeGreaterThan(0);
    for (const m of mats) expect(m.userData.lfxSnow).toBeUndefined();
    fig.dispose();
  });
});
