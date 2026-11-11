import { describe, it, expect } from 'vitest';
import { buildLayout, fillSlots, COLS } from '../src/js/store3d/world/layout.js';
import { findPath, isFree, nearestFree } from '../src/js/store3d/nav/path.js';

// Synthetischer Katalog analog der Hülle: Neuheiten, Kinder, Ab 18, Serien-Genres, Film-Genres, Querbeet
function makeDepartments(total) {
  const depts = [];
  let n = 0;
  const take = (count) => Array.from({ length: count }, () => `i${n++}`);
  const films = Math.round(total * 0.8);
  const series = total - films;
  const kids = Math.round(total * 0.06);
  const adult = Math.round(total * 0.04);
  const genres = ['Action', 'Komödie', 'Drama', 'Thriller', 'Horror', 'Sci-Fi', 'Krimi', 'Abenteuer', 'Fantasy', 'Dokumentation'];
  const filmRest = Math.max(0, films - kids - adult);
  genres.forEach((g, i) => {
    const c = Math.floor(filmRest / genres.length) + (i < filmRest % genres.length ? 1 : 0);
    if (c) depts.push({ id: `genre-${g}`, label: g, kind: 'genre', color: '#33aaff', itemIds: take(c) });
  });
  if (kids) depts.push({ id: 'kids', label: 'Kinder', kind: 'kids', color: '#ffcc00', itemIds: take(kids) });
  if (adult) depts.push({ id: 'adult', label: 'Ab 18', kind: 'adult', color: '#ff2222', itemIds: take(adult) });
  ['Drama', 'Comedy', 'Krimi', 'Mehr'].forEach((g, i) => {
    const c = Math.floor(series / 4) + (i < series % 4 ? 1 : 0);
    if (c) depts.push({ id: `series-${g}`, label: `Serien · ${g}`, kind: 'series', color: '#a070ff', itemIds: take(c) });
  });
  // Neuheiten: die letzten 24 Titel zusätzlich
  const all = depts.flatMap((d) => d.itemIds);
  depts.unshift({ id: 'new', label: 'Neuheiten', kind: 'new', color: '#ff3b3b', itemIds: all.slice(-Math.min(24, all.length)) });
  return depts;
}

const overlap = (a, b) => a.x0 < b.x1 - 1e-6 && a.x1 > b.x0 + 1e-6 && a.z0 < b.z1 - 1e-6 && a.z1 > b.z0 + 1e-6;

describe('store3d layout', () => {
  for (const total of [50, 900, 1500]) {
    describe(`${total} Titel`, () => {
      const depts = makeDepartments(total);
      const lay = buildLayout(depts);

      it('platziert jede itemId genau einmal (Neuheiten zusätzlich)', () => {
        const newIds = new Set(depts.find((d) => d.kind === 'new').itemIds);
        const ids = depts.filter((d) => d.kind !== 'new').flatMap((d) => d.itemIds);
        expect(ids.length).toBeGreaterThan(0);
        for (const id of ids) {
          const pl = lay.placements[id] || [];
          expect(pl.length, id).toBe(newIds.has(id) ? 2 : 1);
          if (newIds.has(id)) expect(pl.some((p) => p.dept === 'new')).toBe(true);
        }
        const placed = Object.keys(lay.placements).length;
        expect(placed).toBe(new Set(ids).size);
      });

      it('Slots verweisen auf die Platzierungen', () => {
        for (const [id, pl] of Object.entries(lay.placements)) {
          for (const p of pl) expect(lay.faces[p.face].slots[p.slot]).toBe(id);
        }
      });

      it('Regal-Kollisionsrechtecke überlappen nicht (auch nicht mit Wänden/Tresen)', () => {
        const shelves = lay.colliders.filter((c) => c.kind === 'shelf');
        const others = lay.colliders.filter((c) => c.kind !== 'shelf');
        for (let i = 0; i < shelves.length; i++) {
          for (let j = i + 1; j < shelves.length; j++) expect(overlap(shelves[i], shelves[j]), `${i}/${j}`).toBe(false);
          for (const o of others) expect(overlap(shelves[i], o), `${i}/${o.kind}`).toBe(false);
        }
      });

      it('alle Regalfronten sind vom Eingang per A* erreichbar', () => {
        const start = lay.spawn;
        expect(isFree(lay.nav, start.x, start.z)).toBe(true);
        for (const f of lay.faces) {
          expect(isFree(lay.nav, f.stand.x, f.stand.z), `stand ${f.id}`).toBe(true);
          const path = findPath(lay.nav, start, f.stand);
          expect(path, f.id).not.toBeNull();
          expect(path.length).toBeGreaterThan(0);
        }
        const reg = findPath(lay.nav, start, lay.register);
        expect(reg).not.toBeNull();
      });

      it('Raum wächst, Stand liegt innerhalb', () => {
        expect(lay.w).toBeGreaterThanOrEqual(12.5);
        for (const f of lay.faces) {
          expect(f.stand.x).toBeGreaterThan(0);
          expect(f.stand.x).toBeLessThan(lay.w);
          expect(f.stand.z).toBeGreaterThan(0);
          expect(f.stand.z).toBeLessThan(lay.d);
        }
      });

      it('ist deterministisch', () => {
        const again = buildLayout(makeDepartments(total));
        const strip = (l) => JSON.stringify({ ...l, nav: { ...l.nav, blocked: Array.from(l.nav.blocked) } });
        expect(strip(again)).toBe(strip(lay));
      });
    });
  }

  it('Raumgröße wächst mit der Titelzahl', () => {
    const a = buildLayout(makeDepartments(50));
    const b = buildLayout(makeDepartments(1500));
    expect(b.w * b.d).toBeGreaterThan(a.w * a.d);
  });

  it('benannte Zonen inkl. reservierter Plätze', () => {
    const lay = buildLayout(makeDepartments(900));
    for (const id of ['entrance', 'register', 'snack', 'tv', 'staff', 'returns', 'reserve', 'window', 'kids', 'adult']) {
      expect(lay.zones[id], id).toBeTruthy();
    }
    expect(lay.zones.snack.reserved).toBe(true);
    expect(nearestFree(lay.nav, lay.zones.adult.x, lay.zones.adult.z)).toBeTruthy();
  });

  it('leerer Katalog erzeugt trotzdem einen begehbaren Raum', () => {
    const lay = buildLayout([]);
    expect(lay.faces.length).toBe(0);
    expect(isFree(lay.nav, lay.spawn.x, lay.spawn.z)).toBe(true);
  });

  it('fillSlots verteilt gleichmäßig und zentriert', () => {
    const s = fillSlots(['a', 'b', 'c'], 5);
    expect(s.length).toBe(5 * COLS);
    expect(s.filter(Boolean).length).toBe(3);
    const full = fillSlots(Array.from({ length: 35 }, (_, i) => `x${i}`), 5);
    expect(full.every(Boolean)).toBe(true);
  });
});
