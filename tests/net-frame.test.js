// Netzrahmen (net/frame.js): Golden-Vektoren, Identität bei W0/D0, Hin-und-zurück-Toleranz, Bereichstreue, Türen, Vektoren, Yaw, Regen-Würfel.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { buildCity, areaAt } from '../src/js/store3d/world/city.js';
import { createFrame, wrapYaw, encYaw, encPitch, W0, D0 } from '../src/js/store3d/net/frame.js';
import { wxRoll, wxRain } from '../src/js/store3d/net/proto.js';

const golden = JSON.parse(fs.readFileSync(new URL('./fixtures/mp-frame.json', import.meta.url), 'utf8'));
const mk = (W, D) => ({ w: W, d: D, city: buildCity({ w: W, d: D, door: { x0: W / 2 - 1.1, x1: W / 2 + 1.1 } }) });
const WS = [12.5, 16, 20, 28];
const DS = [18, 26, 40];
/** Toleranz in cm: 0,5 cm x größte Rückwärtssteigung (Außenabschnitte von x bzw. gestrecktes z) + Rundung der Rückgabe. */
const tolCm = (W, D) => 0.5 * Math.max(1, (W / 2 - 4.5) / 1.75, D / 18) + 0.1;

describe('Golden-Vektoren', () => {
  for (const g of golden.layouts) {
    const L = mk(g.W, g.D);
    const f = createFrame(L);
    describe(`W=${g.W} D=${g.D}`, () => {
      it('enc entspricht den eingefrorenen Werten', () => {
        for (const p of g.pts) expect(f.enc(...p.local, p.r), p.name).toEqual(p.net);
      });
      it('dec bringt jeden Punkt in die Toleranz zurück', () => {
        const tol = tolCm(g.W, g.D) / 100;
        for (const p of g.pts) {
          const d = f.dec(...p.net, p.r);
          expect(Math.abs(d[0] - p.local[0]), p.name).toBeLessThanOrEqual(tol);
          expect(Math.abs(d[1] - p.local[1]), p.name).toBeLessThanOrEqual(0.0051);
          expect(Math.abs(d[2] - p.local[2]), p.name).toBeLessThanOrEqual(tol);
        }
      });
      it('encVec entspricht den eingefrorenen Werten', () => {
        for (const v of g.vec) expect(f.encVec(v.at[0], v.at[1], v.v[0], v.v[1], v.r), v.name).toEqual(v.net);
      });
    });
  }
  it('Yaw-Wrap und Regen-Würfel (eingefroren)', () => {
    for (const w of golden.wx) expect(wxRoll(w.sd, w.ms)).toBe(w.roll);
    for (const y of golden.yaw) {
      const w = wrapYaw(y.in);
      expect(w).toBeGreaterThan(-Math.PI - 1e-12);
      expect(w).toBeLessThanOrEqual(Math.PI + 1e-12);
      expect(Math.abs(Math.sin(w) - Math.sin(y.in))).toBeLessThan(1e-9);
      expect(Math.abs(Math.cos(w) - Math.cos(y.in))).toBeLessThan(1e-9);
    }
  });
});

describe('Identität bei W0/D0', () => {
  const f = createFrame(mk(W0, D0));
  it('enc ist x100 gerundet, auch im Palast', () => {
    for (const [x, y, z, r] of [[0, 0, 0, 0], [6.25, 1, 9, 0], [-3.7, 0.5, -11, 2], [20.1, 0, 30, 2], [-3.5, 0, 28.8, 1], [16, 0.4, 47, 1], [12.5, 0, 18, 0]]) {
      expect(f.enc(x, y, z, r)).toEqual([Math.round(x * 100), Math.round(y * 100), Math.round(z * 100)]);
    }
  });
  it('hin und zurück < 1 cm', () => {
    for (let x = -4; x <= 20; x += 0.37) for (const z of [-5, 3.3, 17.9, 25, 40]) {
      const d = f.dec(...f.enc(x, 0, z, 2), 2);
      expect(Math.abs(d[0] - x)).toBeLessThan(0.01);
      expect(Math.abs(d[2] - z)).toBeLessThan(0.01);
    }
  });
});

describe('Hin und zurück innerhalb der Toleranz, monoton, stetig', () => {
  for (const W of WS) for (const D of DS) {
    it(`W=${W} D=${D}`, () => {
      const L = mk(W, D);
      const f = createFrame(L);
      const tol = tolCm(W, D) / 100;
      const sz = D + 10.7;
      let prevX = -Infinity;
      for (let x = -6; x <= W + 14; x += 0.11) {
        for (const r of [0, 2]) {
          const e = f.enc(x, 0.3, 5, r);
          const d = f.dec(...e, r);
          expect(Math.abs(d[0] - x), `x=${x}`).toBeLessThanOrEqual(tol);
        }
        const nx = f.enc(x, 0, 0, 0)[0];
        expect(nx).toBeGreaterThanOrEqual(prevX);
        prevX = nx;
      }
      let prevZ = -Infinity;
      for (let z = -12; z <= D + 33; z += 0.13) {
        const e = f.enc(3, 0, z, 2);
        const d = f.dec(...e, 2);
        expect(Math.abs(d[2] - z), `z=${z}`).toBeLessThanOrEqual(tol);
        expect(e[2]).toBeGreaterThanOrEqual(prevZ);
        prevZ = e[2];
      }
      const { x0, x1 } = L.city.palast.rect;
      for (let x = x0 - 1; x <= x1 + 1; x += 0.09) {
        const e = f.enc(x, 0, sz + 8, 1);
        expect(Math.abs(f.dec(...e, 1)[0] - x)).toBeLessThanOrEqual(tol);
      }
      // sz wird 28.7
      expect(f.enc(0, 0, sz, 2)[2]).toBe(2870);
    });
  }
});

describe('Bereichstreue', () => {
  const centers = (L) => {
    const zn = L.city.zones;
    const mid = (r) => [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];
    const pts = [];
    for (const id of ['doorway', 'yard', 'alley', 'kiosk', 'palastEntrance', 'crossing', 'sideN', 'sideS', 'palastFoyer', 'palastHall']) pts.push([id, ...mid(zn[id].rect), 0.4]);
    pts.push(['street', L.w / 2, L.d + 5.6, 0], ['shop', L.w / 2, L.d / 2, 0]);
    return pts;
  };
  for (const W of WS) for (const D of DS) {
    it(`areaAt vor und nach Ab-/Rückbildung (W=${W} D=${D})`, () => {
      const L = mk(W, D);
      const f = createFrame(L);
      for (const [id, x, z, y] of centers(L)) {
        const area = areaAt(L, x, z, y);
        expect(f.area(x, z, y) === 1).toBe(area === 'palastHall' || area === 'palastFoyer');
        const r = f.area(x, z, y);
        const back = f.dec(...f.enc(x, y, z, r), r);
        expect(areaAt(L, ...[back[0], back[2], back[1]]), id).toBe(area);
      }
    });
  }
  it('Ladentür -> Ladentür und Palasttür -> Palasttür über Layoutgrenzen', () => {
    for (const [Wa, Da] of [[12.5, 18], [20, 26], [28, 40]]) for (const [Wb, Db] of [[12.5, 18], [16, 40], [28, 26]]) {
      const A = mk(Wa, Da); const B = mk(Wb, Db);
      const fa = createFrame(A); const fb = createFrame(B);
      const cross = (x, z, y, r) => { const e = fa.enc(x, y, z, r); const d = fb.dec(...e, r); return [d[0], d[2], d[1]]; };
      for (const dx of [-1.0, 0, 1.0]) for (const dz of [0.1, 0.3, 0.6]) {
        const rA = fa.area(Wa / 2 + dx, Da + dz, 0);
        const b = cross(Wa / 2 + dx, Da + dz, 0, rA);
        expect(areaAt(A, Wa / 2 + dx, Da + dz, 0)).toBe('doorway');
        expect(areaAt(B, ...b), `Ladentür ${Wa}x${Da} -> ${Wb}x${Db}`).toBe('doorway');
      }
      for (const dx of [-1.4, 0, 1.4]) {
        const sa = Da + 10.7;
        const rA = fa.area(Wa / 2 + dx, sa + 0.1, 0);
        const b = cross(Wa / 2 + dx, sa + 0.1, 0, rA);
        const want = areaAt(A, Wa / 2 + dx, sa + 0.1, 0);
        expect(want).toBe('palastEntrance');
        expect(areaAt(B, ...b), `Palasttür ${Wa}x${Da} -> ${Wb}x${Db}`).toBe('palastEntrance');
        // direkt hinter der Tür (Foyer, r=1): gleiche x-Abbildung wie davor, stetig
        const foy = cross(Wa / 2 + dx, sa + 1.0, 0, 1);
        expect(areaAt(B, ...foy)).toBe('palastFoyer');
      }
      const hall = cross(Wa / 2, Da + 10.7 + 12, 0.4, 1);
      expect(areaAt(B, ...hall)).toBe('palastHall');
    }
  });
  it('Palast-/Allgemein-Abbildung sind an der Palasttür gleich (kein Sprung beim r-Wechsel)', () => {
    for (const W of WS) {
      const f = createFrame(mk(W, 18));
      for (const dx of [-1.5, -0.7, 0, 0.7, 1.5]) expect(f.enc(W / 2 + dx, 0, 28.8, 1)).toEqual(f.enc(W / 2 + dx, 0, 28.8, 2));
    }
  });
});

describe('Vektoren, Yaw, Pitch', () => {
  it('encVec/decVec-Rundreise und Richtungen', () => {
    for (const W of WS) for (const D of DS) {
      const f = createFrame(mk(W, D));
      for (const [x, z, r] of [[W / 2, D + 5, 2], [1, D / 2, 0], [W / 2 - 8, D + 22, 1], [W + 5, -3, 2]]) {
        const e = f.enc(x, 0, z, r);
        const v = f.decVec(e[0], e[2], ...f.encVec(x, z, 2.5, -1.5, r), r);
        expect(Math.abs(v[0] - 2.5)).toBeLessThan(0.02 * Math.max(1, (W / 2 - 4.5) / 1.75));
        expect(Math.abs(v[1] + 1.5)).toBeLessThan(0.02 * Math.max(1, D / 18));
        const d = f.decDir(e[0], e[2], ...f.encDir(x, z, 0.6, 0.8, r), r);
        expect(Math.hypot(...d)).toBeCloseTo(1, 1);
        expect(d[0]).toBeGreaterThan(0);
        expect(d[1]).toBeGreaterThan(0);
      }
    }
  });
  it('wrapYaw nach (-π, π]', () => {
    expect(wrapYaw(Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapYaw(-Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapYaw(3 * Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapYaw(0.5 + 8 * Math.PI)).toBeCloseTo(0.5, 9);
    expect(wrapYaw(-0.5 - 6 * Math.PI)).toBeCloseTo(-0.5, 9);
    expect(wrapYaw(NaN)).toBe(0);
    expect(encYaw(7)).toBe(Math.round((7 - 2 * Math.PI) * 100));
    expect(Math.abs(encYaw(1e6))).toBeLessThanOrEqual(315);
    expect(Object.is(encYaw(-0.001), 0)).toBe(true);
  });
  it('encPitch klemmt auf ±157', () => {
    expect(encPitch(5)).toBe(157);
    expect(encPitch(-5)).toBe(-157);
    expect(encPitch(0.123)).toBe(12);
  });
  it('ohne layout.city nur die allgemeine Abbildung; r=1 fällt darauf zurück', () => {
    const f = createFrame({ w: 16, d: 26 });
    expect(f.enc(5, 0, 10, 1)).toEqual(f.enc(5, 0, 10, 0));
    expect(f.area(5, 10)).toBe(0);
    expect(f.area(5, 40)).toBe(2);
  });
});

describe('Regen-Würfel', () => {
  it('wxRoll im Bereich [0,1), gleiche Eingabe gleiches Ergebnis, Slot-Wechsel nach 30 min', () => {
    for (let i = 0; i < 200; i++) {
      const r = wxRoll(i * 7919, i * 1234567);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
    }
    expect(wxRoll(42, 1800000 * 10)).toBe(wxRoll(42, 1800000 * 10 + 1799999));
    expect(wxRoll(42, 1800000 * 10)).not.toBe(wxRoll(42, 1800000 * 11));
    expect(wxRain(0, 0)).toBe(true);
    expect(wxRain(123456789, 1800000 * 5 + 17)).toBe(false);
    expect(wxRain(42, 1800000 * 1000)).toBe(true);
  });
});
