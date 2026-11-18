import { describe, it, expect } from 'vitest';
import {
  LEN, VERSION, defaultCode, encodeColor, decodeColor, decode, toRender, randomLook, outfitHash, equal, clamp, CUSTOM_COLOR,
} from '../src/js/store3d/char/look2.js';
import { SKIN, HAIR_COLORS, CLOTH_COLORS, UNLOCK_BASE, UNLOCK_HATS } from '../src/js/store3d/char/ids.js';

const seeded = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

describe('look2', () => {
  it('Standardcode ist gültig und stabil', () => {
    const d = defaultCode();
    expect(d).toHaveLength(LEN);
    expect(d[0]).toBe(VERSION);
    expect(decode(d)).toEqual(d);
    expect(defaultCode()).not.toBe(d);
  });

  it('Rundreise decode(randomLook) für 200 Zufalls-Codes', () => {
    const rand = seeded(7);
    for (let i = 0; i < 200; i++) {
      const c = randomLook(rand);
      expect(c).toHaveLength(LEN);
      expect(decode(c)).toEqual(c);
      const r = toRender(c);
      expect(r.v).toBe(2);
      expect(r.handItem).toBeNull();
    }
  });

  it('randomLook nutzt Freischaltteile nur wenn freigeschaltet', () => {
    const rand = seeded(3);
    for (let i = 0; i < 300; i++) for (const k of [22, 10, 14, 18, 21, 24]) expect(randomLook(rand)[k]).toBeLessThan(UNLOCK_BASE);
    const all = new Set(UNLOCK_HATS.map((_, j) => 'hat:' + (UNLOCK_BASE + j)));
    let seen = false;
    for (let i = 0; i < 600; i++) if (randomLook(rand, all)[22] >= UNLOCK_BASE) seen = true;
    expect(seen).toBe(true);
  });

  it('randomLook: Hautton gleichverteilt über alle 14, Hose != Oberteilfarbe', () => {
    const rand = seeded(11);
    const skins = new Set();
    for (let i = 0; i < 400; i++) { const c = randomLook(rand); skins.add(c[1]); expect(c[15]).not.toBe(c[11]); }
    expect(skins.size).toBe(14);
  });

  it('randomLook ist deterministisch', () => {
    expect(randomLook(seeded(5))).toEqual(randomLook(seeded(5)));
    expect(() => randomLook(() => 1)).not.toThrow();
  });

  it('decode ist tolerant bei Müll', () => {
    const d = defaultCode();
    for (const bad of [null, undefined, 5, 'x', {}, [], [2], new Array(27).fill(0), new Array(26).fill('a')]) expect(decode(bad)).toEqual(d);
    const wrongVer = d.slice(); wrongVer[0] = 1;
    expect(decode(wrongVer)).toEqual(d);
    const c = randomLook(seeded(1));
    const m = c.slice();
    m[1] = 99; m[2] = -1; m[3] = 2.5; m[5] = 'x'; m[6] = 40; m[10] = 5000; m[13] = 0x2000000; m[22] = UNLOCK_BASE + UNLOCK_HATS.length;
    const out = decode(m);
    for (const i of [1, 2, 3, 5, 6, 10, 13, 22]) expect(out[i]).toBe(d[i]);
    expect(out[4]).toBe(c[4]);
  });

  it('Unlock-Codes nur gültig, wenn der Index existiert', () => {
    const c = defaultCode();
    c[22] = UNLOCK_BASE + UNLOCK_HATS.length - 1;
    expect(decode(c)[22]).toBe(c[22]);
    expect(toRender(c).hat.id).toBe(UNLOCK_HATS[UNLOCK_HATS.length - 1]);
    c[22] = UNLOCK_BASE + UNLOCK_HATS.length;
    expect(decode(c)[22]).toBe(0);
    c[22] = 20;
    expect(decode(c)[22]).toBe(0);
  });

  it('Farben: Palette und eigene Farbe', () => {
    expect(decodeColor(2, HAIR_COLORS)).toEqual(HAIR_COLORS[2]);
    expect(decodeColor(99, CLOTH_COLORS)).toEqual(CLOTH_COLORS[0]);
    const e = encodeColor([1, 0.5, 0]);
    expect(e & CUSTOM_COLOR).toBe(CUSTOM_COLOR);
    expect(e).toBe(0x1000000 | 0xff8000);
    const back = decodeColor(e, CLOTH_COLORS);
    expect(back[0]).toBeCloseTo(1, 5);
    expect(back[1]).toBeCloseTo(0.502, 2);
    expect(encodeColor(5)).toBe(5);
    const c = defaultCode(); c[11] = e;
    expect(decode(c)[11]).toBe(e);
    expect(toRender(c).top.color[0]).toBeCloseTo(1, 5);
    // Haut nur Palette
    c[1] = e;
    expect(decode(c)[1]).toBe(defaultCode()[1]);
  });

  it('toRender: Größe, Statur, Form, Haut', () => {
    const c = defaultCode();
    c[2] = 0; c[3] = 0;
    let r = toRender(c);
    expect(r.height).toBeCloseTo(0.9, 6); expect(r.build).toBeCloseTo(0.85, 6);
    c[2] = 20; c[3] = 20; c[4] = 2; c[1] = 13;
    r = toRender(c);
    expect(r.height).toBeCloseTo(1.1, 6); expect(r.build).toBeCloseTo(1.25, 6);
    expect(r.shape).toBe('hips');
    expect(r.skin).toEqual(SKIN[13]);
    expect(r.top.pattern).toBe('plain');
    expect(r.shoes.model).toBe('sneaker');
  });

  it('outfitHash: 8 Hex, ignoriert Haut/Körper/Augen/Brauen, reagiert auf Outfit', () => {
    const a = randomLook(seeded(21));
    const h = outfitHash(a);
    expect(h).toMatch(/^[0-9a-f]{8}$/);
    const b = a.slice(); b[1] = (a[1] + 1) % 14; b[2] = 20 - a[2]; b[3] = 20 - a[3]; b[4] = (a[4] + 1) % 3; b[7] = (a[7] + 1) % 6; b[8] = (a[8] + 1) % 5;
    expect(outfitHash(b)).toBe(h);
    for (const i of [5, 6, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]) {
      const c = a.slice(); c[i] = c[i] === 0 ? 1 : 0;
      expect(outfitHash(c), 'Feld ' + i).not.toBe(h);
    }
  });

  it('equal und clamp', () => {
    expect(equal(defaultCode(), defaultCode())).toBe(true);
    const x = defaultCode(); x[3] = 4;
    expect(equal(defaultCode(), x)).toBe(false);
    expect(equal(null, x)).toBe(false);
    expect(clamp(5, 0, 3)).toBe(3); expect(clamp(-1, 0, 3)).toBe(0); expect(clamp(2, 0, 3)).toBe(2);
  });
});
