// @vitest-environment jsdom
// Gegenstand an der rechten Hand (1.18.0): setHandItem baut den Gegenstand in das gemergte Mesh (kein zusätzlicher Draw-Call),
// eigener Cache-Zweig, Baseline ohne Gegenstand bleibt unberührt, Alt-Looks und v2-Looks.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createFigure, disposeFigureCaches, figureCacheInfo } from '../src/js/store3d/npc/figure.js';
import { HAND_ITEMS, buildHandItem } from '../src/js/store3d/npc/figure-parts.js';
import { makeLook } from '../src/js/store3d/npc/looks.js';
import { seeded } from '../src/js/store3d/modules/m4-util.js';

const v2 = (over = {}) => ({
  v: 2, skin: [0.9, 0.7, 0.55], height: 1, build: 1, shape: 'straight', hairStyle: 'short', hair: [0.2, 0.1, 0.1], eyes: 'dot', brows: 'none', beard: 'none',
  top: { cut: 'tee', color: [0.8, 0.2, 0.2], pattern: 'plain', color2: [1, 1, 1] },
  bottom: { cut: 'jeans', color: [0.1, 0.2, 0.3], pattern: 'plain', color2: [1, 1, 0] },
  shoes: { model: 'sneaker', color: [0.1, 0.1, 0.1], sole: [1, 1, 1] }, glasses: 'none', hat: { id: 'none', color: [1, 0, 0] }, bag: { id: 'none', color: [0.2, 0.6, 0.3] },
  handItem: null, ...over,
});
const old = () => makeLook(seeded(77), {});
const counts = (f) => { let meshes = 0; let skinned = 0; f.root.traverse((o) => { if (o.isMesh) meshes++; if (o.isSkinnedMesh) skinned++; }); return { meshes, skinned }; };
const verts = (f) => f.mesh.geometry.attributes.position.count;

beforeEach(() => disposeFigureCaches());
afterAll(() => disposeFigureCaches());

describe('setHandItem', () => {
  for (const [name, mk] of [['v2', () => v2()], ['Alt-Look', old]]) {
    it(`${name}: jeder Gegenstand bleibt EIN Mesh (kein zusätzlicher Draw-Call), Geometrie endlich und mit Skin-Gewichten`, () => {
      for (const id of HAND_ITEMS) {
        const f = createFigure(mk());
        const base = verts(f);
        const before = counts(f);
        expect(f.setHandItem(id)).toBe(id);
        expect(f.getHandItem()).toBe(id);
        expect(counts(f)).toEqual(before);
        expect(before).toEqual({ meshes: 1, skinned: 1 });
        const g = f.mesh.geometry;
        expect(g.attributes.position.array.every(Number.isFinite)).toBe(true);
        expect(g.attributes.skinIndex.count).toBe(g.attributes.position.count);
        if (id === 'candy' || id === 'popcorn') expect(verts(f)).toBe(base); // leere Wurfhand
        else expect(verts(f), id).toBeGreaterThan(base);
        expect(f.setHandItem(null)).toBeNull();
        expect(verts(f)).toBe(base);
        f.dispose();
      }
    });
  }

  it('Gegenstand hängt am rechten Arm-Bone (Skin-Index 4), nicht an Körper oder Kopf', () => {
    const f = createFigure(v2());
    const idx0 = Array.from(f.mesh.geometry.attributes.skinIndex.array).filter((_, i) => i % 4 === 0);
    f.setHandItem('whip');
    const idx = Array.from(f.mesh.geometry.attributes.skinIndex.array).filter((_, i) => i % 4 === 0);
    const countOf = (a, b) => a.filter((x) => x === b).length;
    expect(countOf(idx, 4)).toBeGreaterThan(countOf(idx0, 4));
    expect(countOf(idx, 1)).toBe(countOf(idx0, 1));
    expect(countOf(idx, 2)).toBe(countOf(idx0, 2));
    f.dispose();
  });

  it('unbekannte ID = leere Hand; dieselbe ID ist ein No-op ohne neue Geometrie', () => {
    const f = createFigure(v2());
    const g0 = f.mesh.geometry;
    expect(f.setHandItem('nope')).toBeNull();
    expect(f.setHandItem(null)).toBeNull();
    expect(f.mesh.geometry).toBe(g0);
    f.setHandItem('belt');
    const g1 = f.mesh.geometry;
    expect(g1).not.toBe(g0);
    expect(f.setHandItem('belt')).toBe('belt');
    expect(f.mesh.geometry).toBe(g1);
    f.dispose();
  });

  it('Cache: gleicher Look + Gegenstand teilen die Geometrie, Referenzen laufen sauber zurück', () => {
    const a = createFigure(v2());
    const b = createFigure(v2({ height: 1.1 }));
    a.setHandItem('bag');
    b.setHandItem('bag');
    expect(a.mesh.geometry).toBe(b.mesh.geometry);
    expect(figureCacheInfo()).toEqual({ size: 2, free: 1, refs: 2 }); // Basis frei, Gegenstand-Zweig 2 Referenzen
    a.setHandItem(null);
    expect(a.mesh.geometry).not.toBe(b.mesh.geometry);
    expect(figureCacheInfo().refs).toBe(2);
    a.dispose(); b.dispose();
    expect(figureCacheInfo().refs).toBe(0);
    b.dispose();
    expect(figureCacheInfo().refs).toBe(0);
  });

  it('Baseline: nach setHandItem(null) wieder derselbe Cache-Eintrag wie ohne Gegenstand', () => {
    const a = createFigure(old());
    const g = a.mesh.geometry;
    a.setHandItem('whip');
    a.setHandItem(null);
    expect(a.mesh.geometry).toBe(g);
    const b = createFigure(old());
    expect(b.mesh.geometry).toBe(g);
    a.dispose(); b.dispose();
  });

  it('Schirm: andere Schirmfarbe = andere Geometrie (Farbe steckt nicht im Look-Schlüssel)', () => {
    const l1 = { ...old(), umbrellaColor: [0.9, 0.1, 0.1] };
    const l2 = { ...l1, umbrellaColor: [0.1, 0.1, 0.9] };
    const a = createFigure(l1);
    const b = createFigure(l2);
    a.setHandItem('umbrella'); b.setHandItem('umbrella');
    expect(a.mesh.geometry).not.toBe(b.mesh.geometry);
    a.dispose(); b.dispose();
  });

  it('Tasche und Tüte nehmen die Look-Farbe (v2: bag.color, alt: bagColor)', () => {
    const colors = (geos) => new Set(geos.map((g) => Array.from(g.attributes.color.array.slice(0, 3)).map((v) => Math.round(v * 100)).join('.')));
    const want = [0.2, 0.6, 0.3].map((v) => Math.round(v * 100)).join('.');
    expect(colors(buildHandItem(v2(), 'bag')).has(want)).toBe(true);
    expect(colors(buildHandItem({ ...old(), bagColor: [0.2, 0.6, 0.3] }, 'shopping')).has(want)).toBe(true);
  });

  it('setLook behält den Gegenstand; Ich-Sicht baut ihn nicht; zurück bringt ihn wieder', () => {
    const f = createFigure(v2());
    f.setHandItem('laser');
    f.setLook(v2({ hairStyle: 'afro' }));
    expect(f.getHandItem()).toBe('laser');
    const bare = createFigure(v2({ hairStyle: 'afro' }));
    expect(verts(f)).toBeGreaterThan(verts(bare));
    bare.dispose();
    f.setEgo(true);
    expect(f.getHandItem()).toBe('laser');
    const ego = verts(f);
    f.setEgo(false);
    expect(verts(f)).toBeGreaterThan(ego);
    f.update(0.1);
    f.dispose();
  });

  it('look.handItem (Render-Look) setzt den Startgegenstand', () => {
    const f = createFigure(v2({ handItem: 'dryer' }));
    expect(f.getHandItem()).toBe('dryer');
    f.dispose();
    const g = createFigure(v2({ handItem: 'quatsch' }));
    expect(g.getHandItem()).toBeNull();
    g.dispose();
  });

  it('nach dispose ohne Wirkung', () => {
    const f = createFigure(v2());
    f.dispose();
    expect(f.setHandItem('belt')).toBeNull();
    expect(figureCacheInfo().refs).toBe(0);
  });

  it('Gegenstandsbau ist rein: leere Wurfhand und Unbekanntes liefern []', () => {
    expect(buildHandItem(v2(), 'candy')).toEqual([]);
    expect(buildHandItem(v2(), 'popcorn')).toEqual([]);
    expect(buildHandItem(v2(), 'zzz')).toEqual([]);
    expect(buildHandItem(v2(), 'whip').length).toBe(buildHandItem(v2(), 'whip').length);
    expect(buildHandItem(null, 'bag').length).toBeGreaterThan(0);
  });
});

describe('Gürtel als Schlaufe (1.18.0)', () => {
  it('besteht aus Ring-Stücken, Schnalle und freiem Ende, alles endlich, Schlaufe hängt unter der Hand und ist breiter als ein Stab', () => {
    const parts = buildHandItem(v2(), 'belt');
    expect(parts.length).toBeGreaterThanOrEqual(15);
    let minY = Infinity; let maxY = -Infinity; let minX = Infinity; let maxX = -Infinity;
    for (const g of parts) {
      const a = g.attributes.position.array;
      expect(a.every(Number.isFinite)).toBe(true);
      for (let i = 0; i < a.length; i += 3) { minX = Math.min(minX, a[i]); maxX = Math.max(maxX, a[i]); minY = Math.min(minY, a[i + 1]); maxY = Math.max(maxY, a[i + 1]); }
    }
    expect(maxY).toBeLessThan(0.82); // Schnalle in der Faust (y ≈ 0,78)
    expect(maxY - minY).toBeGreaterThan(0.2); // Ring-Durchmesser
    expect(maxX - minX).toBeGreaterThan(0.1); // mehr als ein schmaler Stab (Ebene gedreht)
  });
});

describe('Waffen-Detail an der Figur (1.19.0)', () => {
  it('Gürtel, Peitsche und Laser bestehen aus mehr Teilen als vorher (Naht, Wicklung, Fransen, Rillen), alles endlich', () => {
    const need = { belt: 25, whip: 20, laser: 9 };
    for (const [id, min] of Object.entries(need)) {
      const parts = buildHandItem(v2(), id);
      expect(parts.length, id).toBeGreaterThanOrEqual(min);
      for (const g of parts) expect(g.attributes.position.array.every(Number.isFinite), id).toBe(true);
    }
  });

  it('Peitsche und Laser hängen weiter nur am rechten Arm-Bone, Mesh-Anzahl bleibt 1', () => {
    for (const id of ['belt', 'whip', 'laser']) {
      const f = createFigure(v2());
      const idx0 = Array.from(f.mesh.geometry.attributes.skinIndex.array).filter((_, i) => i % 4 === 0);
      f.setHandItem(id);
      const idx = Array.from(f.mesh.geometry.attributes.skinIndex.array).filter((_, i) => i % 4 === 0);
      const cnt = (a, b) => a.filter((x) => x === b).length;
      expect(cnt(idx, 4) - cnt(idx0, 4), id).toBe(idx.length - idx0.length);
      expect(counts(f)).toEqual({ meshes: 1, skinned: 1 });
      f.dispose();
    }
  });
});
