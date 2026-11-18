import { describe, it, expect } from 'vitest';
import { buildCity, areaAt, visibleGroups, AREAS } from '../src/js/store3d/world/city.js';
import { isFree } from '../src/js/store3d/nav/path.js';
import { layoutOf, overlap } from './helpers-city.js';

const SIZES = [[12.5, 9], [20, 12], [28, 16]];

// Vor der Änderung (1.16.2-Stand von buildCity) erzeugte Gebäudefarben: die Farbvergabe darf sich nicht verschieben.
const COLORS_BEFORE = {
  '12.5x9': [['NW2', [0.6, 0.55, 0.5]], ['NW1', [0.55, 0.28, 0.24]], ['NE1', [0.5, 0.36, 0.4]], ['NE1b', [0.62, 0.5, 0.36]], ['NE2', [0.6, 0.55, 0.5]], ['YB', [0.62, 0.5, 0.36]], ['SW', [0.6, 0.55, 0.5]], ['SE1', [0.42, 0.5, 0.42]], ['SE2', [0.38, 0.42, 0.52]], ['QN', [0.62, 0.5, 0.36]], ['QS', [0.55, 0.28, 0.24]]],
  '20x12': [['NW2', [0.5, 0.36, 0.4]], ['NW1', [0.55, 0.28, 0.24]], ['NE1', [0.55, 0.28, 0.24]], ['NE1b', [0.55, 0.28, 0.24]], ['NE2', [0.42, 0.5, 0.42]], ['YB', [0.6, 0.55, 0.5]], ['SW', [0.5, 0.36, 0.4]], ['SE1', [0.6, 0.55, 0.5]], ['SE2', [0.55, 0.28, 0.24]], ['QN', [0.6, 0.55, 0.5]], ['QS', [0.42, 0.5, 0.42]]],
  '28x16': [['NW2', [0.6, 0.55, 0.5]], ['NW1', [0.62, 0.5, 0.36]], ['NE1', [0.42, 0.5, 0.42]], ['NE1b', [0.42, 0.5, 0.42]], ['NE2', [0.6, 0.55, 0.5]], ['YB', [0.55, 0.28, 0.24]], ['SW', [0.38, 0.42, 0.52]], ['SE1', [0.6, 0.55, 0.5]], ['SE2', [0.42, 0.5, 0.42]], ['QN', [0.6, 0.55, 0.5]], ['QS', [0.62, 0.5, 0.36]]],
};

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
  return seen;
}

describe('Friseursalon (Stadt-Daten)', () => {
  for (const [W, D] of SIZES) {
    describe(`Ladenbreite ${W}`, () => {
      const c = buildCity({ w: W, d: D });
      const sz = c.frame.sz;
      const L = { w: W, d: D, city: c };

      it('Salon-Rect ist fest (x -22..-14, z sz..sz+7) und liegt im Gebäude SW', () => {
        expect(c.salon.rect).toEqual({ x0: -22, z0: sz, x1: -14, z1: sz + 7 });
        const sw = c.buildings.find((b) => b.id === 'SW');
        expect(c.salon.rect.x0).toBeGreaterThanOrEqual(sw.x0);
        expect(c.salon.rect.x1).toBeLessThanOrEqual(sw.x1);
        expect(c.salon.door).toMatchObject({ x0: -18.8, x1: -17.2, z: sz });
        expect(c.zones.salon.rect).toMatchObject(c.salon.rect);
        expect(c.spawns.salon.x).toBe(-18);
        const f = c.shopFronts.find((s) => s.id === 'SW');
        expect(f.x).toBe(-18);
        expect(f.text).toBe('FRISEUR HAARSCHARF');
      });

      it('Gebäudefarben aller Häuser unverändert gegenüber vorher', () => {
        expect(c.buildings.map((b) => [b.id, b.color])).toEqual(COLORS_BEFORE[`${W}x${D}`]);
      });

      it('Kollider: Salon ist frei, SW-Teile und Wände überschneiden Straße und Gehwege nicht', () => {
        const sal = c.colliders.filter((q) => /^(salon|SW)/.test(q.id));
        expect(sal.length).toBeGreaterThanOrEqual(8);
        for (const q of sal) {
          for (const zid of ['sidewalkS', 'road', 'sidewalkN']) expect(overlap(q, c.zones[zid].rect), `${q.id} ${zid}`).toBe(false);
        }
        // Salon-Inneres bis 3 m ist kein Vollkörper: nur die Wände und das Dach darüber liegen darin
        for (const q of c.colliders.filter((k) => k.kind === 'building' && overlap(k, c.salon.rect))) expect(q.y0, q.id).toBe(3.0);
        // Türöffnung 1,6 m ist frei
        const door = c.salon.door;
        for (const q of c.colliders.filter((k) => /^salon/.test(k.id) && !k.y0)) expect(q.x0 >= door.x1 - 1e-9 || q.x1 <= door.x0 + 1e-9 || q.z0 > door.z + 0.2 || q.z1 < door.z, q.id).toBe(true);
      });

      it('areaAt: salon im Rechteck (unter 2,9 m), vor der Tür Straße', () => {
        const cx = -18;
        expect(areaAt(L, cx, sz + 3.5)).toBe('salon');
        expect(areaAt(L, cx, sz + 0.05)).toBe('salon');
        expect(areaAt(L, cx, sz - 0.3)).toBe('street');
        expect(areaAt(L, -23, sz + 3)).not.toBe('salon');
        expect(AREAS).toContain('salon');
      });

      it('visibleGroups.salonInterior: im Salon und < 12 m vor der Tür, an der Ladentür nicht', () => {
        expect(visibleGroups(L, 'salon', -18, sz + 3).salonInterior).toBe(true);
        expect(visibleGroups(L, 'salon', -18, sz + 3).street).toBe(true);
        expect(visibleGroups(L, 'street', -18, sz - 4).salonInterior).toBe(true);
        expect(visibleGroups(L, 'street', -18, sz - 11).salonInterior).toBe(true);
        expect(visibleGroups(L, 'doorway', W / 2, D + 0.2).salonInterior).toBe(false);
        expect(visibleGroups(L, 'shop', W / 2, D - 2).salonInterior).toBe(false);
        expect(visibleGroups(L, 'street', W / 2, D + 1.6).salonInterior).toBe(false);
      });
    });
  }

  for (const n of [80, 400, 1500]) {
    describe(`Navigation (${n} Titel)`, () => {
      const L = layoutOf(n);
      const sp = L.city.spawns;
      const sa = L.city.salon;
      const seen = flood(L.nav, sp.street.x, sp.street.z);
      const reached = (x, z) => seen[Math.floor((z - L.nav.oz) / L.nav.cell) * L.nav.cols + Math.floor((x - L.nav.ox) / L.nav.cell)] === 1;

      it('Salon-Mitte, Spawn, Stuhl und Anker sind vom Gehweg aus erreichbar (durch die Tür)', () => {
        expect(isFree(L.nav, sp.salon.x, sp.salon.z)).toBe(true);
        expect(reached(sp.salon.x, sp.salon.z)).toBe(true);
        expect(reached(-18, sa.rect.z0 + 3.5)).toBe(true);
        for (const k of ['gabi', 'ronny']) expect(reached(sa[k].x, sa[k].z), k).toBe(true);
        expect(reached(sa.chair.x, sa.chair.z - 0.8)).toBe(true);
      });

      it('Salon ist ringsum geschlossen: nur die Tür führt hinein', () => {
        // Punkte direkt hinter den Wänden (außerhalb des Salons) sind im Gebäude, nicht erreichbar
        const r = sa.rect;
        for (const [x, z] of [[r.x0 - 1, r.z0 + 3], [r.x1 + 1, r.z0 + 3], [-18, r.z1 + 1.5]]) expect(reached(x, z), `${x}/${z}`).toBe(false);
      });
    });
  }
});
