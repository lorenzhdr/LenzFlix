import { describe, it, expect } from 'vitest';
import { isFree, findPath, makeNavGrid } from '../src/js/store3d/nav/path.js';
import { rebuildNav, NAV_RADIUS } from '../src/js/store3d/world/layout.js';
import { layoutOf } from './helpers-city.js';

function flood(nav, x, z) {
  const c0 = Math.floor((x - nav.ox) / nav.cell);
  const r0 = Math.floor((z - nav.oz) / nav.cell);
  const seen = new Uint8Array(nav.cols * nav.rows);
  const q = [r0 * nav.cols + c0];
  seen[q[0]] = 1;
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    const c = i % nav.cols;
    const r = (i - c) / nav.cols;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cc = c + dc;
      const rr = r + dr;
      if (cc < 0 || rr < 0 || cc >= nav.cols || rr >= nav.rows) continue;
      const k = rr * nav.cols + cc;
      if (seen[k] || nav.blocked[k]) continue;
      seen[k] = 1;
      q.push(k);
    }
  }
  return { seen, count: q.length };
}
const reached = (nav, fl, x, z) => fl.seen[Math.floor((z - nav.oz) / nav.cell) * nav.cols + Math.floor((x - nav.ox) / nav.cell)] === 1;

for (const n of [80, 400, 1500]) {
  describe(`Welt-Navigation (${n} Titel)`, () => {
    const L = layoutOf(n);
    const sp = L.city.spawns;
    const fl = flood(L.nav, sp.street.x, sp.street.z);

    it('von der Straße erreichbar: Laden (durch die Tür), Palast, Hof (über die Gasse), Kiosk, Gasse, Seitenstraßen, beide Gehwege', () => {
      for (const id of ['shop', 'palast', 'yard', 'kiosk', 'alley']) expect(reached(L.nav, fl, sp[id].x, sp[id].z), id).toBe(true);
      const f = L.city.frame;
      for (const [x, z] of [[(f.xc0 + f.xc1) / 2, f.zSN + 2], [(f.xc0 + f.xc1) / 2, f.zSS - 2], [f.XW0 + 2, f.D + 1.2], [f.XW1 - 2, f.D + 9.35], [L.w / 2, f.roadMid]]) {
        expect(isFree(L.nav, x, z), `${x}/${z}`).toBe(true);
        expect(reached(L.nav, fl, x, z), `${x}/${z}`).toBe(true);
      }
    });

    it('Palast: Foyer und Saal sind über die Saaltüren erreichbar', () => {
      const p = L.city.palast;
      expect(reached(L.nav, fl, (p.hall.x0 + p.hall.x1) / 2, p.hall.z1 - 2)).toBe(true);
    });

    it('versiegelt: kein erreichbarer Rasterpunkt am Rand der Welt', () => {
      const { cols, rows, blocked } = L.nav;
      let edge = 0;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if ((r <= 1 || c <= 1 || r >= rows - 2 || c >= cols - 2) && fl.seen[r * cols + c]) edge++;
      expect(edge).toBe(0);
      expect(blocked.length).toBe(cols * rows);
    });

    it('Zellzahl <= 160 000 bei 0,25 m, Gesamtfläche erreichbar im erwarteten Bereich', () => {
      expect(L.nav.cell).toBe(0.25);
      expect(L.nav.cols * L.nav.rows).toBeLessThanOrEqual(160000);
      expect(fl.count).toBeGreaterThan(20000);
      expect(fl.count).toBeLessThan(L.nav.cols * L.nav.rows);
    });

    it('Straße -> Regalfront: Pfad; Tür gesperrt (doorBlock): kein Pfad; frei: wieder Pfad', () => {
      const target = L.faces[0].stand;
      expect(findPath(L.nav, sp.street, target)).not.toBeNull();
      L.colliders.push(L.doorBlock);
      rebuildNav(L);
      expect(isFree(L.nav, L.spawn.x, L.spawn.z)).toBe(true);
      expect(findPath(L.nav, sp.street, target)).toBeNull();
      L.colliders.splice(L.colliders.indexOf(L.doorBlock), 1);
      rebuildNav(L);
      expect(findPath(L.nav, sp.street, target)).not.toBeNull();
    });

    it('rebuildNav behält die Außengrenzen (Raster-Ursprung und Größe gleich)', () => {
      const a = { ox: L.nav.ox, oz: L.nav.oz, cols: L.nav.cols, rows: L.nav.rows };
      rebuildNav(L);
      expect({ ox: L.nav.ox, oz: L.nav.oz, cols: L.nav.cols, rows: L.nav.rows }).toEqual(a);
      expect(a.ox).toBe(L.city.bounds.x0);
    });

    it('Fußwege der Passanten verlaufen auf freien Zellen', () => {
      for (const p of L.city.sidewalkPaths) {
        for (let i = 0; i < p.pts.length - 1; i++) {
          const a = p.pts[i];
          const b = p.pts[i + 1];
          const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.25);
          for (let k = 0; k <= steps; k++) expect(isFree(L.nav, a.x + ((b.x - a.x) * k) / steps, a.z + ((b.z - a.z) * k) / steps), `${p.id}#${i}.${k}`).toBe(true);
        }
      }
    });

    it('Entdeckungs- und Requisitenplätze am Boden stehen frei', () => {
      for (const s of [...L.city.discoverSlots, ...L.city.propSlots]) if (!s.y) expect(isFree(L.nav, s.x, s.z), s.id).toBe(true);
    });
  });
}

describe('Nav-Aufbau', () => {
  it('makeNavGrid für das größte Layout < 100 ms (Handy-Reserve), ein Nav-Neuaufbau ebenso', () => {
    const L = layoutOf(1500);
    const t = performance.now();
    makeNavGrid(L.bounds, L.colliders, NAV_RADIUS, L.navCell);
    expect(performance.now() - t).toBeLessThan(100);
  });
});
