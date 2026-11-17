// VIDEOTHEK LENZ · Entdeckungen: Katalog, Speicherung, Hinseh-Erkennung, Regeln (rein).
import { describe, it, expect } from 'vitest';
import { CATALOG, TOTAL, isKnownId, titleOf } from '../src/js/store3d/discover/catalog.js';
import { createDiscoverStore, parseFound, keyFor } from '../src/js/store3d/discover/storage.js';
import { createGaze, isRoofRainNight } from '../src/js/store3d/discover/gaze.js';

const IDS = ['golden-tape', 'graffiti', 'secret-door', 'roof-rain', 'roof', 'cat-pet', 'kiosk-snack', 'hoop-3', 'can-pyramid', 'richard-ban', 'richard-rent', 'palast-film', 'palast-tape', 'zebra', 'car-honk'];

function mem(initial = {}) {
  const d = { ...initial };
  return { d, getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, removeItem: (k) => { delete d[k]; } };
}

describe('Katalog', () => {
  it('enthält genau die 15 verbindlichen IDs, eindeutig', () => {
    expect(TOTAL).toBe(15);
    expect(CATALOG.map((e) => e.id).sort()).toEqual([...IDS].sort());
    expect(new Set(CATALOG.map((e) => e.id)).size).toBe(15);
  });
  it('jeder Eintrag hat Titel, Beschreibung und Hinweis', () => {
    for (const e of CATALOG) {
      expect(e.title.length).toBeGreaterThan(2);
      expect(e.desc.length).toBeGreaterThan(10);
      expect(e.hint.length).toBeGreaterThan(10);
      expect(e.hint.toLowerCase()).not.toContain(e.title.toLowerCase());
    }
    expect(titleOf('golden-tape')).toBe('Goldene Kassette');
    expect(isKnownId('nope')).toBe(false);
  });
});

describe('Speicherung', () => {
  it('found ist idempotent, zählt und persistiert pro Nutzer', () => {
    const s = mem();
    const a = createDiscoverStore({ storage: s, userId: 'u1', now: () => 1000 });
    expect(a.add('roof')).toBe(true);
    expect(a.add('roof')).toBe(false);
    expect(a.add('unbekannt')).toBe(false);
    expect(a.count()).toBe(1);
    expect(s.d[keyFor('u1')]).toContain('roof');
    expect(createDiscoverStore({ storage: s, userId: 'u1' }).has('roof')).toBe(true);
    expect(createDiscoverStore({ storage: s, userId: 'u2' }).has('roof')).toBe(false);
    expect(keyFor(null)).toBe('lfx.store.discover.anon');
  });
  it('übersteht Müll und fehlenden oder werfenden Storage', () => {
    expect(parseFound('{{{')).toEqual({});
    expect(parseFound('{"found":[1,2]}')).toEqual({});
    expect(parseFound('{"found":{"roof":"x","fremd":5,"zebra":7}}')).toEqual({ roof: 1, zebra: 7 });
    const s = mem({ [keyFor('x')]: 'Müll' });
    expect(createDiscoverStore({ storage: s, userId: 'x' }).count()).toBe(0);
    expect(createDiscoverStore({ storage: null }).add('zebra')).toBe(true);
    const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
    const st = createDiscoverStore({ storage: bad });
    expect(st.add('zebra')).toBe(true);
    expect(() => st.reset()).not.toThrow();
  });
  it('meldet neue Funde und reset leert', () => {
    const st = createDiscoverStore({ storage: mem() });
    const got = [];
    const off = st.onAdd((id) => got.push(id));
    st.add('car-honk');
    off();
    st.add('cat-pet');
    expect(got).toEqual(['car-honk']);
    expect(st.ids()).toEqual(['cat-pet', 'car-honk']);
    st.reset();
    expect(st.count()).toBe(0);
  });
});

describe('Hinseh-Erkennung', () => {
  const target = { x: 0, y: 1.5, z: -0.17, normal: { x: 0, z: -1 } };
  const eye = { x: 0, y: 1.6, z: -3 };
  const toward = { x: 0, y: -0.03, z: 1 };
  it('löst nach der Verweilzeit genau einmal aus', () => {
    const g = createGaze({ dwell: 1.5 });
    let hits = 0;
    for (let i = 0; i < 40; i++) if (g.step(0.1, eye, toward, target)) hits++;
    expect(hits).toBe(1);
    expect(g.done).toBe(true);
  });
  it('zählt nicht bei Abstand, Blickrichtung oder falscher Seite', () => {
    const g = createGaze({ dwell: 1 });
    expect(g.looking({ ...eye, z: -9 }, toward, target)).toBe(false);
    expect(g.looking(eye, { x: 1, y: 0, z: 0 }, target)).toBe(false);
    expect(g.looking({ x: 0, y: 1.6, z: 2 }, { x: 0, y: 0, z: -1 }, target)).toBe(false);
  });
  it('Blickverlust setzt den Zähler zurück', () => {
    const g = createGaze({ dwell: 1, grace: 0.1 });
    for (let i = 0; i < 6; i++) g.step(0.1, eye, toward, target);
    for (let i = 0; i < 4; i++) g.step(0.1, eye, { x: 1, y: 0, z: 0 }, target);
    expect(g.progress()).toBe(0);
    expect(g.done).toBe(false);
  });
  it('Regennacht nur auf dem Dach, 20 bis 5 Uhr', () => {
    const base = { area: 'roof', raining: true };
    expect(isRoofRainNight({ ...base, hour: 22 })).toBe(true);
    expect(isRoofRainNight({ ...base, hour: 20 })).toBe(true);
    expect(isRoofRainNight({ ...base, hour: 4.9 })).toBe(true);
    expect(isRoofRainNight({ ...base, hour: 5 })).toBe(false);
    expect(isRoofRainNight({ ...base, hour: 12 })).toBe(false);
    expect(isRoofRainNight({ ...base, hour: 22, raining: false })).toBe(false);
    expect(isRoofRainNight({ ...base, hour: 22, area: 'yard' })).toBe(false);
  });
});
