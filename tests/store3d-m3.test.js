import { describe, it, expect } from 'vitest';
import {
  formatClock, departmentLabel, locationLabel, typeLabel, episodeTag, resumeLabel, coverRef, backdropRef, progressOf, describeResult,
  defaultSections, pathLength, trailPoints, atlasCell, spreadCenters, splitEven, wrapText,
} from '../src/js/store3d/modules/m3-util.js';
import { buildLayout } from '../src/js/store3d/world/layout.js';
import { findPath, isFree } from '../src/js/store3d/nav/path.js';

const ids = (p, n) => Array.from({ length: n }, (_, i) => `${p}${i}`);
const depts = [
  { id: 'new', label: 'Neuheiten', kind: 'new', color: '#f00', itemIds: ids('n', 10) },
  { id: 'genre-Horror', label: 'Horror', kind: 'genre', color: '#0f0', itemIds: ids('h', 60) },
  { id: 'genre-Drama', label: 'Drama', kind: 'genre', color: '#00f', itemIds: ids('d', 60) },
  { id: 'kids', label: 'Kinder', kind: 'kids', color: '#ff0', itemIds: ids('k', 20) },
  { id: 'series-Drama', label: 'Serien · Drama', kind: 'series', color: '#f0f', itemIds: ids('s', 20) },
];

describe('M3 Standort-Label', () => {
  const layout = buildLayout(depts);
  const face = (dept) => layout.faces.find((f) => f.dept === dept);
  const slotFor = (dept) => {
    const f = face(dept);
    const run = layout.runs.findIndex((r) => r.id === f.run) + 1;
    return { run, face: f.index, dept: f.dept };
  };

  it('ohne Slot: im Lager', () => {
    expect(locationLabel(null, layout, depts)).toBe('im Lager');
  });

  it('Freier Gang: Gang n · Regal m · Abteilung', () => {
    expect(locationLabel(slotFor('genre-Horror'), layout, depts)).toMatch(/^Gang \d+ · Regal \d+ · Horror$/);
  });

  it('Sonderbereiche tragen ihren Namen und doppeln die Abteilung nicht', () => {
    expect(locationLabel(slotFor('kids'), layout, depts)).toMatch(/^Kinder-Ecke · Regal \d+$/);
    expect(locationLabel(slotFor('new'), layout, depts)).toMatch(/^Neuheiten-Regal · Regal \d+$/);
    expect(locationLabel(slotFor('series-Drama'), layout, depts)).toMatch(/^Serienwand · Regal \d+ · Serien · Drama$/);
  });

  it('Gangnummern zählen nur freie Gänge und beginnen bei 1', () => {
    const wood = layout.runs.map((r, i) => ({ r, i })).filter((x) => x.r.style === 'wood');
    expect(wood.length).toBeGreaterThan(0);
    const first = wood[0];
    const f = layout.faces.find((q) => q.run === first.r.id);
    expect(locationLabel({ run: first.i + 1, face: f.index, dept: f.dept }, layout, depts)).toMatch(/^Gang 1 /);
  });

  it('departmentLabel', () => {
    expect(departmentLabel(depts, 'kids')).toBe('Kinder');
    expect(departmentLabel(depts, 'x')).toBe('');
  });
});

describe('M3 Suchergebnis-Mapping', () => {
  const inCat = new Set(['m1', 's1', 'm2']);
  const env = { has: (id) => inCat.has(id), locate: (id) => (id === 'm1' || id === 's1' ? `Gang 1 · ${id}` : null) };

  it('Film im Regal: Hinführen + Tresen', () => {
    const d = describeResult({ Id: 'm1', Name: 'Nachtzug', Type: 'Movie', ProductionYear: 1999 }, env);
    expect(d.inStore).toBe(true);
    expect(d.location).toBe('Gang 1 · m1');
    expect(d.actions).toEqual(['guide', 'counter']);
    expect(d.year).toBe('1999');
    expect(d.typeLabel).toBe('Film');
  });

  it('Film im Katalog, aber nicht im Regal: im Lager, nur Tresen', () => {
    const d = describeResult({ Id: 'm2', Name: 'Lagerfilm', Type: 'Movie' }, env);
    expect(d.location).toBe('im Lager');
    expect(d.actions).toEqual(['counter']);
  });

  it('Titel außerhalb des Katalogs: Abspielen', () => {
    const d = describeResult({ Id: 'zz', Name: 'Fremd', Type: 'Movie' }, env);
    expect(d.inCatalog).toBe(false);
    expect(d.actions).toEqual(['play']);
  });

  it('Folge: Standort der Serie, Abspielen und Zur Serie', () => {
    const d = describeResult({
      Id: 'e1', Name: 'Pilot', Type: 'Episode', SeriesId: 's1', SeriesName: 'Serie X', ParentIndexNumber: 2, IndexNumber: 3,
    }, env);
    expect(d.isEpisode).toBe(true);
    expect(d.targetId).toBe('s1');
    expect(d.sub).toBe('Serie X · S2 F3');
    expect(d.actions).toEqual(['guide', 'play', 'series']);
  });

  it('Folge ohne Serie im Katalog: nur Abspielen', () => {
    const d = describeResult({ Id: 'e2', Name: 'Pilot', Type: 'Episode', SeriesId: 'nope' }, env);
    expect(d.actions).toEqual(['play']);
  });

  it('Labels', () => {
    expect(typeLabel({ Type: 'Series' })).toBe('Serie');
    expect(episodeTag({ ParentIndexNumber: 1, IndexNumber: 10 })).toBe('S1 F10');
    expect(episodeTag({})).toBe('');
    expect(resumeLabel({
      Type: 'Episode', SeriesName: 'Serie X', ParentIndexNumber: 2, IndexNumber: 3, Name: 'Titel',
    })).toBe('Weiterschauen: Serie X · S2 F3 · Titel');
    expect(resumeLabel({ Type: 'Movie', Name: 'Film' })).toBe('Weiterschauen: Film');
  });

  it('Bildquellen: Folge zeigt Serien-Cover, Backdrop hat Vorrang', () => {
    expect(coverRef({ Id: 'e', Type: 'Episode', SeriesId: 's', SeriesPrimaryImageTag: 'tg' })).toEqual({ id: 's', tag: 'tg' });
    expect(coverRef({ Id: 'm', Type: 'Movie', ImageTags: { Primary: 'p' } })).toEqual({ id: 'm', tag: 'p' });
    expect(backdropRef({ Id: 'm', BackdropImageTags: ['b'], ImageTags: { Primary: 'p' } })).toEqual({ id: 'm', type: 'Backdrop', tag: 'b' });
    expect(backdropRef({ Id: 'm', BackdropImageTags: [], ImageTags: { Primary: 'p' } })).toEqual({ id: 'm', type: 'Primary', tag: 'p' });
  });

  it('Fortschritt', () => {
    expect(progressOf({ lfx: { progress: 0.4 } })).toBeCloseTo(0.4);
    expect(progressOf({ UserData: { PlayedPercentage: 50 } })).toBeCloseTo(0.5);
    expect(progressOf({})).toBe(0);
  });

  it('Standardansicht: Neuheiten und Rückgaben', () => {
    const items = new Map(ids('n', 10).map((i) => [i, { Id: i, Name: i }]));
    const secs = defaultSections({ departments: depts, resume: [{ Id: 'r1' }, { Id: 'r2' }] }, (id) => items.get(id), 4);
    expect(secs.map((s) => s.title)).toEqual(['Neu im Sortiment', 'Zuletzt zurückgegeben']);
    expect(secs[0].items).toHaveLength(4);
    expect(defaultSections({ departments: [], resume: [] }, () => null)).toEqual([]);
  });

  it('Uhrzeit-Format', () => {
    expect(formatClock(new Date(2026, 10, 11, 4, 5, 9))).toBe('Mi 11.11.2026  04:05:09');
  });
});

describe('M3 Leuchtspur', () => {
  it('gerade Strecke: gleichmäßige Punkte mit Blickrichtung', () => {
    const pts = trailPoints({ x: 0, z: 0 }, [{ x: 7, z: 0 }], 0.7);
    expect(pts).toHaveLength(10);
    expect(pts[0].x).toBeCloseTo(0.35);
    expect(pts[1].x - pts[0].x).toBeCloseTo(0.7);
    expect(pts.every((p) => Math.abs(p.z) < 1e-9)).toBe(true);
    // Yaw für „nach Osten“: Vorwärts (−sin a, −cos a) = (1, 0)
    expect(-Math.sin(pts[0].a)).toBeCloseTo(1);
    expect(-Math.cos(pts[0].a)).toBeCloseTo(0);
  });

  it('Knick: Punkte liegen auf dem Streckenzug, Richtung wechselt', () => {
    const pts = trailPoints({ x: 0, z: 0 }, [{ x: 2, z: 0 }, { x: 2, z: 3 }], 0.5);
    expect(pts.length).toBeGreaterThan(8);
    for (const p of pts) {
      const onA = Math.abs(p.z) < 1e-6 && p.x >= -1e-6 && p.x <= 2 + 1e-6;
      const onB = Math.abs(p.x - 2) < 1e-6 && p.z >= -1e-6 && p.z <= 3 + 1e-6;
      expect(onA || onB).toBe(true);
    }
    expect(-Math.cos(pts[pts.length - 1].a)).toBeCloseTo(1); // zuletzt nach Süden (+z)
    for (let i = 1; i < pts.length; i++) {
      expect(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)).toBeLessThanOrEqual(0.5 + 1e-6);
    }
  });

  it('Obergrenze: lange Wege werden gröber gesetzt', () => {
    const pts = trailPoints({ x: 0, z: 0 }, [{ x: 200, z: 0 }], 0.7, 90);
    expect(pts.length).toBeLessThanOrEqual(90);
    expect(pts.length).toBeGreaterThan(80);
  });

  it('leerer oder zu kurzer Weg: keine Punkte', () => {
    expect(trailPoints({ x: 1, z: 1 }, [], 0.7)).toEqual([]);
    expect(trailPoints({ x: 1, z: 1 }, [{ x: 1, z: 1.01 }], 0.7)).toEqual([]);
    expect(pathLength({ x: 0, z: 0 }, [{ x: 3, z: 4 }])).toBe(5);
  });

  it('Spur aus echtem A*-Weg liegt auf freien Zellen', () => {
    const layout = buildLayout(depts);
    const f = layout.faces.find((q) => q.dept === 'genre-Horror');
    const start = { x: layout.spawn.x, z: layout.spawn.z };
    const path = findPath(layout.nav, start, { x: f.stand.x, z: f.stand.z });
    expect(path).toBeTruthy();
    const pts = trailPoints(start, path, 0.7);
    expect(pts.length).toBeGreaterThan(3);
    for (const p of pts) expect(isFree(layout.nav, p.x, p.z)).toBe(true);
  });
});

describe('M3 Atlas und Verteilung', () => {
  it('atlasCell: Pixel und UV (v nach oben)', () => {
    const c = atlasCell(5, 4, 2, 128, 192);
    expect(c).toMatchObject({ x: 128, y: 192, w: 128, h: 192 });
    expect(c.uv).toEqual([0.25, 0, 0.5, 0.5]);
    expect(atlasCell(0, 4, 2, 128, 192).uv).toEqual([0, 0.5, 0.25, 1]);
  });

  it('spreadCenters und splitEven', () => {
    expect(spreadCenters(2, 0, 4)).toEqual([1, 3]);
    expect(splitEven([1, 2, 3, 4, 5], 2, 3)).toEqual([[1, 2, 3], [4, 5]]);
    expect(splitEven([1, 2, 3, 4, 5, 6, 7, 8], 2, 3)).toEqual([[1, 2, 3], [4, 5, 6]]);
    expect(splitEven([1], 2, 3)).toEqual([[1], []]);
  });

  it('wrapText', () => {
    expect(wrapText('Eins zwei drei vier', 9, 3)).toEqual(['Eins zwei', 'drei vier']);
    const l = wrapText('a b c d e f g h', 3, 2);
    expect(l).toHaveLength(2);
    expect(l[1].endsWith('…')).toBe(true);
  });
});
