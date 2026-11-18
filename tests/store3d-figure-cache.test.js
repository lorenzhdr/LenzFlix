// @vitest-environment jsdom
// Figuren-Geometrie-Cache (1.17.0): Referenzzählung + LRU (höchstens 48 unreferenzierte Einträge), lookKey ohne height/build.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createFigure, disposeFigureCaches, figureCacheInfo, GEO_FREE_MAX } from '../src/js/store3d/npc/figure.js';
import { lookKey, makeLook } from '../src/js/store3d/npc/looks.js';
import { seeded } from '../src/js/store3d/modules/m4-util.js';

const v2 = (n = 0, over = {}) => ({
  v: 2, skin: [0.9, 0.7, 0.55], height: 1, build: 1, shape: 'straight', hairStyle: 'short', hair: [0.2, 0.1, 0.1], eyes: 'dot', brows: 'none', beard: 'none',
  top: { cut: 'tee', color: [(n % 256) / 255, Math.floor(n / 256) / 255, 0.5], pattern: 'plain', color2: [1, 1, 1] },
  bottom: { cut: 'jeans', color: [0.1, 0.2, 0.3], pattern: 'plain', color2: [1, 1, 0] },
  shoes: { model: 'sneaker', color: [0.1, 0.1, 0.1], sole: [1, 1, 1] }, glasses: 'none', hat: { id: 'none', color: [1, 0, 0] }, bag: { id: 'none', color: [0, 0, 1] },
  handItem: null, ...over,
});
const disposed = (f) => { const flag = { v: false }; f.mesh.geometry.addEventListener('dispose', () => { flag.v = true; }); return flag; };

beforeEach(() => disposeFigureCaches());
afterAll(() => disposeFigureCaches());

describe('lookKey', () => {
  it('ignoriert height/build (nur Rig-Skalierung), alt und v2', () => {
    const old = makeLook(seeded(11), {});
    expect(lookKey({ ...old, height: 0.9, build: 1.2 })).toBe(lookKey({ ...old, height: 1.05, build: 0.9 }));
    expect(lookKey(v2(1, { height: 0.9, build: 0.85 }))).toBe(lookKey(v2(1, { height: 1.1, build: 1.25 })));
  });
  it('v2: jede Render-Farbe/-Option ändert den Schlüssel, Farben auf 1/255 genau', () => {
    const k = lookKey(v2(5));
    expect(lookKey(v2(6))).not.toBe(k);
    expect(lookKey(v2(5, { hairStyle: 'afro' }))).not.toBe(k);
    expect(lookKey(v2(5, { skin: [0.9, 0.7, 0.552] }))).not.toBe(k);
    expect(lookKey(v2(5, { handItem: null }))).toBe(k);
  });
});

describe('Geometrie-Cache', () => {
  it('Referenzzählung: gleicher Look teilt die Geometrie, dispose senkt, 0 Referenzen bleiben im Cache', () => {
    const a = createFigure(v2(1));
    const b = createFigure(v2(1, { height: 1.1 }));
    expect(a.mesh.geometry).toBe(b.mesh.geometry);
    expect(figureCacheInfo()).toEqual({ size: 1, free: 0, refs: 2 });
    a.dispose();
    expect(figureCacheInfo()).toEqual({ size: 1, free: 0, refs: 1 });
    b.dispose();
    expect(figureCacheInfo()).toEqual({ size: 1, free: 1, refs: 0 });
    b.dispose(); // doppeltes dispose senkt nicht doppelt
    expect(figureCacheInfo().refs).toBe(0);
    const c = createFigure(v2(1));
    expect(figureCacheInfo()).toEqual({ size: 1, free: 0, refs: 1 });
    c.dispose();
  });

  it('LRU: höchstens 48 unreferenzierte Einträge, älteste werden disposed', () => {
    expect(GEO_FREE_MAX).toBe(48);
    const first = createFigure(v2(0));
    const flag = disposed(first);
    first.dispose();
    for (let i = 1; i <= 60; i++) createFigure(v2(i)).dispose();
    const info = figureCacheInfo();
    expect(info.free).toBe(48);
    expect(info.size).toBe(48);
    expect(flag.v).toBe(true);
  });

  it('LRU: kürzlich benutzte bleiben, referenzierte werden nie entsorgt', () => {
    const held = createFigure(v2(0));
    const hflag = disposed(held);
    const early = createFigure(v2(1));
    const eflag = disposed(early);
    early.dispose();
    for (let i = 2; i <= 49; i++) createFigure(v2(i)).dispose(); // 49 frei → early (ältester) fliegt raus
    expect(eflag.v).toBe(true);
    expect(hflag.v).toBe(false);
    for (let i = 50; i <= 120; i++) createFigure(v2(i)).dispose();
    expect(hflag.v).toBe(false);
    expect(figureCacheInfo().refs).toBe(1);
    // Wiederbenutzen frischt auf: Eintrag 100 anfassen, dann weitere füllen
    const again = createFigure(v2(100));
    const aflag = disposed(again);
    again.dispose();
    for (let i = 121; i <= 150; i++) createFigure(v2(i)).dispose();
    expect(aflag.v).toBe(false);
    held.dispose();
  });

  it('setLook wechselt die Referenz (neu +1, alt −1)', () => {
    const f = createFigure(v2(1));
    f.setLook(v2(2));
    expect(figureCacheInfo()).toEqual({ size: 2, free: 1, refs: 1 });
    f.setLook(v2(2, { height: 0.95 })); // gleicher Schlüssel
    expect(figureCacheInfo().refs).toBe(1);
    f.dispose();
    expect(figureCacheInfo()).toEqual({ size: 2, free: 2, refs: 0 });
  });

  it('Alt-Looks laufen ebenfalls über den Cache; disposeFigureCaches leert alles', () => {
    const f = createFigure(makeLook(seeded(21), {}));
    const g = createFigure(makeLook(seeded(21), {}));
    expect(f.mesh.geometry).toBe(g.mesh.geometry);
    f.dispose(); g.dispose();
    expect(figureCacheInfo().size).toBe(1);
    disposeFigureCaches();
    expect(figureCacheInfo()).toEqual({ size: 0, free: 0, refs: 0 });
  });
});
