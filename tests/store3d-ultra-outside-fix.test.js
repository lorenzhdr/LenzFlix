// @vitest-environment jsdom
// W6-Fix Ultra-Außen (fa1): Skyline-Ringlage, Fenster nicht über Schildern, Baum-/Möbelplatzierung, Wiegen + Schnee verkettet,
// Skyline im Nebel, Wiegen ruhig bei reduzierter Bewegung, Schnee-Option am gehaltenen Ding.
import { describe, it, expect, vi } from 'vitest';
import { MeshBasicMaterial, PerspectiveCamera, Group } from 'three';
import { layoutOf } from './helpers-city.js';
import { planUltraCity, facadeWindows, signBoards, windowOnSign, skylineRoot, makeKeepout, segmentHitsSphere } from '../src/js/store3d/world/ultra-plan.js';
import { buildUltraTrees, buildUltraSkyline, swayTime, SWAY_PERIOD, fogMixOf } from '../src/js/store3d/world/build-city-ultra.js';
import { createSnow, SNOW_KEY } from '../src/js/store3d/weather/snow-patch.js';

const mkOut = (snow = null) => {
  const out = { tinted: [], hooks: [], tod: 'day', rain: false, wx: null, pal: { shade: [1, 1, 1], sky: [[0.3, 0.5, 0.9], [0.5, 0.7, 0.95], [0.85, 0.94, 1]] } };
  out.tint = (mat, base = [1, 1, 1], opts = null) => { out.tinted.push({ mat, base }); if (snow && !(opts && opts.snow === false)) snow.patch(mat); return mat; };
  return out;
};
const sphereBox = (q, x, y, z) => Math.hypot(Math.max(q.x0 - x, 0, x - q.x1), Math.max((q.y0 || 0) - y, 0, y - (Number.isFinite(q.y1) ? q.y1 : 99)), Math.max(q.z0 - z, 0, z - q.z1));

for (const n of [80, 600]) {
  describe(`Ultra-Außen fa1 (${n} Titel)`, () => {
    const L = layoutOf(n);
    const c = L.city;
    const f = c.frame;
    const plan = planUltraCity(L);

    it('C43: nächster Skyline-Sockel liegt von jedem Standort ≥ 50 m von der Kamera', () => {
      const spots = [[48, 28.2], [32.1, 50.5], [7.8, 30.6], [7.8, 20], [f.XW0 + 1, 28], [f.XW1 - 1, 28], [(f.xc0 + f.xc1) / 2, f.zSN + 1], [(f.xc0 + f.xc1) / 2, f.zSS - 1], [c.bounds.x0 + 1, c.bounds.z0 + 1], [c.bounds.x1 - 1, c.bounds.z1 - 1]];
      for (const [cx, cz] of spots) {
        const p = skylineRoot(plan.skyline, cx, cz);
        let min = Infinity;
        for (const b of plan.skyline.blds) min = Math.min(min, Math.hypot(p.x + b.x - cx, p.z + b.z - cz));
        expect(min).toBeGreaterThanOrEqual(50);
      }
    });

    it('C45: kein Ultra-Fenster überdeckt ein Schild (city.signs, Ladenschilder)', () => {
      const boards = signBoards(c);
      expect(boards.length).toBeGreaterThan(5);
      const wins = facadeWindows(c);
      for (const w of wins) expect(windowOnSign(w, boards, 0)).toBe(false);
      // Gegenprobe: ohne Filter gäbe es Treffer (das LENZSTRASSE-Schild sitzt auf einer Fassade mit Fenstern)
      const s = c.signs.find((q) => q.id === 'street');
      expect(windowOnSign({ axis: 'z', x: s.x, y: s.y, z: s.z, w: 0.9, h: 1.3 }, boards)).toBe(true);
    });

    it('U4/I13/I31: Kronen schneiden keine Kollider, keine Schildtafeln, stehen nicht vor dem Laden und verdecken die Leuchtschilder nicht', () => {
      expect(plan.trees.length).toBeGreaterThan(2);
      const solids = L.colliders.filter((q) => q.kind !== 'bounds' && Number.isFinite(q.x0));
      const keepSigns = plan.street.signs;
      plan.crowns.forEach((b) => {
        const r = Math.max(b.sx, b.sy, b.sz) * 0.9;
        for (const q of solids) expect(sphereBox(q, b.x, b.y, b.z)).toBeGreaterThanOrEqual(r);
        for (const s of keepSigns) expect(sphereBox({ x0: s.x - 0.3, x1: s.x + 0.3, z0: s.z - 0.3, z1: s.z + 0.3, y0: 1.75, y1: 2.35 }, b.x, b.y, b.z)).toBeGreaterThanOrEqual(r);
      });
      for (const t of plan.trees) expect(t.x > -1.5 && t.x < f.W + 1.5 && t.z > f.D - 0.5 && t.z < f.D + 6).toBe(false);
      const tg = { x: f.W / 2, y: 4.0, z: f.D + 0.05 };
      for (const e of [{ x: f.XW0 + 2, y: 1.6, z: f.roadMid }, { x: f.XW1 - 2, y: 1.6, z: f.roadMid }, { x: (f.xc0 + f.xc1) / 2, y: 1.6, z: f.zSN + 2 }]) {
        if (Math.hypot(tg.x - e.x, tg.z - e.z) > 45) continue;
        for (const b of plan.crowns) expect(segmentHitsSphere(e, tg, b, Math.max(b.sx, b.sy, b.sz) * 0.85)).toBe(false);
      }
    });

    it('I34/U4: kein Mülleimer vor einem Palast-Schaukasten, kein Stamm auf einem Bandenplatz', () => {
      for (const q of c.palast.posterSlots) {
        for (const b of plan.street.bins) expect(Math.abs(b.x - q.x) < q.w / 2 + 0.8 && Math.abs(b.z - q.z) < 0.8).toBe(false);
      }
      const keep = makeKeepout(L);
      expect(keep.blocked(c.palast.posterSlots[0].x, c.palast.posterSlots[0].z + 0.3, 0.17, 'hug')).toBe(true);
    });

    it('deterministisch', () => {
      expect(JSON.stringify(planUltraCity(L))).toBe(JSON.stringify(plan));
    });
  });
}

describe('Baumkronen: Wiegen + liegender Schnee verkettet', () => {
  const L = layoutOf(80);
  const plan = planUltraCity(L);

  it('Krone trägt Wiege- UND Schnee-Hook, eindeutiger Schlüssel, Stamm nur Schnee', () => {
    const snow = createSnow(L);
    const out = mkOut(snow);
    const t = buildUltraTrees(out, L.city, plan);
    const [crown, trunk] = t.meshes;
    const key = crown.material.customProgramCacheKey();
    expect(key).toContain('lfx-ultra-sway');
    expect(key).toContain(SNOW_KEY);
    expect(trunk.material.customProgramCacheKey()).toBe(SNOW_KEY);
    const sh = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>\nvoid main(){}', fragmentShader: '#include <common>\n#include <opaque_fragment>' };
    crown.material.onBeforeCompile(sh, null);
    expect(sh.uniforms.uSway).toBeDefined();
    expect(sh.uniforms.uSnow).toBeDefined();
    expect(sh.vertexShader).toContain('lfxPh');
    expect(sh.vertexShader).toContain('vLfxWp = ');
    expect(sh.fragmentShader).toContain('uSnow');
    // Schlüssel ändert sich bei Wetterwechsel nicht (kein Neukompilieren)
    snow.set(1, null);
    expect(crown.material.customProgramCacheKey()).toBe(key);
    t.dispose();
  });

  it('swayTime: nahtlos periodisch, klein, ab Modulstart', () => {
    expect(SWAY_PERIOD).toBeCloseTo(20 * Math.PI, 10);
    expect(swayTime(1000, 1000)).toBe(0);
    const t = 12.3;
    for (const k of [1.4, 1.1]) {
      expect(Math.sin(k * swayTime(t, 0))).toBeCloseTo(Math.sin(k * swayTime(t + SWAY_PERIOD * 1234, 0)), 6);
    }
    expect(swayTime(5e6, 3)).toBeLessThan(SWAY_PERIOD);
    expect(swayTime(1, 3)).toBeGreaterThanOrEqual(0);
  });

  it('reduzierte Bewegung: ruhig, reagiert auf change, Listener wird in dispose entfernt', () => {
    const listeners = new Set();
    const mq = { matches: true, addEventListener: (e, fn) => listeners.add(fn), removeEventListener: (e, fn) => listeners.delete(fn) };
    vi.stubGlobal('matchMedia', () => mq);
    try {
      const t = buildUltraTrees(mkOut(), L.city, plan);
      const crown = t.meshes[0];
      const hook = crown.material.onBeforeCompile;
      const u = {};
      hook({ uniforms: u, vertexShader: '#include <begin_vertex>', fragmentShader: '' });
      t.update(0.016, 5);
      t.update(0.016, 9);
      expect(u.uSway.value).toBe(0);
      expect(t.still).toBe(true);
      mq.matches = false;
      [...listeners].forEach((fn) => fn({ matches: false }));
      t.update(0.016, 10);
      t.update(0.016, 12);
      expect(u.uSway.value).toBeCloseTo(2, 6);
      expect(listeners.size).toBe(1);
      t.dispose();
      expect(listeners.size).toBe(0);
    } finally { vi.unstubAllGlobals(); }
  });
});

describe('Skyline im Wetter-Nebel', () => {
  const L = layoutOf(80);
  const plan = planUltraCity(L);
  it('fogMixOf: 0 = Ring-Anteil, 1 = ganz Nebelfarbe', () => {
    expect(fogMixOf(0, 0)).toBeCloseTo(0.4, 6);
    expect(fogMixOf(2, 1)).toBe(1);
    expect(fogMixOf(1, 0.5)).toBeGreaterThan(fogMixOf(1, 0));
  });
  it('bei Nebel 1 gleichen sich alle Farben der Horizontfarbe an (weich nachgeführt)', () => {
    const out = mkOut();
    const cam = new PerspectiveCamera();
    cam.position.set(10, 1.7, 20);
    const sk = buildUltraSkyline(out, L.city, plan, cam);
    const col = sk.meshes[0].geometry.attributes.color;
    const hor = out.pal.sky[2];
    const dist = () => { let d = 0; for (let i = 0; i < col.count; i += 7) d += Math.abs(col.getX(i) - hor[0]); return d; };
    const d0 = dist();
    out.wx = { fog: 1 };
    sk.update(0.016);
    const d1 = dist();
    expect(d1).toBeLessThan(d0); // beginnt weich (noch nicht voll)
    for (let i = 0; i < 400; i++) sk.update(0.016);
    expect(dist()).toBeLessThan(d1);
    expect(dist()).toBeLessThan(d0 * 0.8);
    out.wx = { fog: 0 };
    for (let i = 0; i < 400; i++) sk.update(0.016);
    expect(dist()).toBeCloseTo(d0, 5);
    sk.dispose();
  });
});

describe('outdoor.tint Option snow:false', () => {
  it('gehaltenes Ding bekommt keinen Schnee-Patch', () => {
    const snow = createSnow(layoutOf(80));
    const out = mkOut(snow);
    const m = out.tint(new MeshBasicMaterial(), [1, 1, 1], { snow: false });
    expect(m.userData.lfxSnow).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile')).toBe(false);
    const g = new Group();
    expect(g).toBeTruthy();
  });
});
