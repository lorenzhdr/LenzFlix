// @vitest-environment jsdom
// Baselines (1.17.0, Welle 0, auf unverändertem Code erzeugt): Seed-Looks und Geometrie des alten Figurenpfads bleiben bitgleich.
// makeLook() ist eingefroren (Passanten und Seed-Figuren im Mehrspieler); bodyGeometry() für Looks ohne v===2 ebenso.
// Ändert sich ein Hash hier, hat sich das Aussehen aller Passanten oder fremder Seed-Figuren geändert – das ist ein Fehler.
import { describe, it, expect, afterAll } from 'vitest';
import { makeLook } from '../src/js/store3d/npc/looks.js';
import { createFigure, disposeFigureCaches } from '../src/js/store3d/npc/figure.js';
import { seeded } from '../src/js/store3d/modules/m4-util.js';
import { lookSeed } from '../src/js/store3d/net/peers-logic.js';

const fnv = (str) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
};
// 64 feste Pseudonyme (12 Hex-Zeichen wie `k`)
const KEYS = Array.from({ length: 64 }, (_, i) => fnv(`k${i}`) + fnv(`x${i}`).slice(0, 4));
const r6 = (v) => Math.round(v * 1e6) / 1e6;
const lookStr = (l) => JSON.stringify(l, (k, v) => (typeof v === 'number' ? r6(v) : v));

function geoHash(look) {
  const f = createFigure(look);
  const g = f.mesh.geometry;
  const parts = [];
  for (const name of ['position', 'color', 'skinIndex']) {
    const a = g.attributes[name];
    if (!a) { parts.push(`${name}:-`); continue; }
    let acc = '';
    for (let i = 0; i < a.array.length; i++) acc += `${Math.round(a.array[i] * 1e4)},`;
    parts.push(`${name}:${a.array.length}:${fnv(acc)}`);
  }
  f.dispose();
  return parts.join('|');
}

afterAll(() => disposeFigureCaches());

describe('Baseline: Seed-Looks (makeLook eingefroren)', () => {
  it('Mehrspieler-Seed-Looks für 64 Pseudonyme', () => {
    const all = KEYS.map((k) => lookStr(makeLook(seeded(lookSeed(k)), {}))).join('\n');
    expect(fnv(all)).toBe('ef88e2b7');
  });
  it('Passanten-Looks mit Regen für 64 Seeds', () => {
    const all = KEYS.map((k, i) => lookStr(makeLook(seeded(1000 + i), { rain: true }))).join('\n');
    expect(fnv(all)).toBe('2df7baab');
  });
  it('Rollen-Looks (ticket, popcorn, kiosk)', () => {
    const all = ['ticket', 'popcorn', 'kiosk'].map((role) => lookStr(makeLook(() => 0.5, { role }))).join('\n');
    expect(fnv(all)).toBe('e59e9aeb');
  });
});

describe('Baseline: Geometrie des alten Figurenpfads', () => {
  it('64 Seed-Figuren + 3 Rollen ergeben dieselben Vertex-Daten', () => {
    const looks = [
      ...KEYS.map((k) => makeLook(seeded(lookSeed(k)), {})),
      ...['ticket', 'popcorn', 'kiosk'].map((role) => makeLook(() => 0.5, { role })),
    ];
    const all = looks.map(geoHash).join('\n');
    expect(fnv(all)).toBe('7aea3ee7');
  });
});
