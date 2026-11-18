// @vitest-environment jsdom
// Figuren-Detail und Winterkleidung (1.19.0 U4): optionale Flags '|d' / '|w' im Geometrie-Cache, ohne Flag bitgleich, gleiche Mesh-Anzahl,
// Teile am richtigen Bone, setDetail/setWinter idempotent, Abstands-LOD (ultra-figures).
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createFigure, disposeFigureCaches, figureCacheInfo, liveFigures } from '../src/js/store3d/npc/figure.js';
import { makeLook } from '../src/js/store3d/npc/looks.js';
import { seeded } from '../src/js/store3d/modules/m4-util.js';
import { Scene, PerspectiveCamera } from 'three';
import { createUltra } from '../src/js/store3d/engine/ultra.js';
import ultraFigures, { stepFigureLod, DETAIL_ON, DETAIL_OFF, MAX_SWAPS } from '../src/js/store3d/modules/ultra-figures.js';

const v2 = (over = {}) => ({
  v: 2, skin: [0.9, 0.7, 0.55], height: 1, build: 1, shape: 'straight', hairStyle: 'short', hair: [0.2, 0.1, 0.1], eyes: 'dot', brows: 'none', beard: 'none',
  top: { cut: 'tee', color: [0.8, 0.2, 0.2], pattern: 'plain', color2: [1, 1, 1] },
  bottom: { cut: 'jeans', color: [0.1, 0.2, 0.3], pattern: 'plain', color2: [1, 1, 0] },
  shoes: { model: 'sneaker', color: [0.1, 0.1, 0.1], sole: [1, 1, 1] }, glasses: 'none', hat: { id: 'none', color: [1, 0, 0] }, bag: { id: 'none', color: [0.2, 0.6, 0.3] },
  handItem: null, ...over,
});
const oldLook = (n = 77) => { const l = makeLook(seeded(n), {}); return { ...l, hat: null, hatColor: null, umbrella: false }; };
const counts = (f) => { let meshes = 0; f.root.traverse((o) => { if (o.isMesh) meshes++; }); return meshes; };
const verts = (f) => f.mesh.geometry.attributes.position.count;
const posCopy = (f) => Array.from(f.mesh.geometry.attributes.position.array);
const bonesAt = (f, pred) => {
  const g = f.mesh.geometry;
  const p = g.attributes.position;
  const s = g.attributes.skinIndex;
  const set = new Set();
  for (let i = 0; i < p.count; i++) if (pred(p.getX(i), p.getY(i), p.getZ(i))) set.add(s.getX(i));
  return set;
};

beforeEach(() => disposeFigureCaches());
afterAll(() => disposeFigureCaches());

describe('Detail und Winter', () => {
  for (const [name, mk] of [['v2', () => v2()], ['Alt-Look', () => oldLook()]]) {
    it(`${name}: ohne Flags bitgleich, Flags erzeugen mehr Vertices, gleiche Mesh-Anzahl, Skin-Länge = Positionen`, () => {
      const f = createFigure(mk());
      const base = posCopy(f);
      const baseVerts = verts(f);
      const meshes = counts(f);
      f.setDetail(true);
      const detailVerts = verts(f);
      expect(detailVerts).toBeGreaterThan(baseVerts);
      expect(counts(f)).toBe(meshes);
      f.setWinter({ hat: false, scarf: true });
      expect(verts(f)).toBeGreaterThan(detailVerts);
      f.setWinter(true);
      const g = f.mesh.geometry;
      expect(g.attributes.skinIndex.count).toBe(g.attributes.position.count);
      expect(g.attributes.skinWeight.count).toBe(g.attributes.position.count);
      expect(g.attributes.position.array.every(Number.isFinite)).toBe(true);
      expect(counts(f)).toBe(meshes);
      f.setWinter(false);
      f.setDetail(false);
      expect(posCopy(f)).toEqual(base);
      expect(verts(f)).toBe(baseVerts);
    });

    it(`${name}: setDetail/setWinter idempotent, Cache-Zweige getrennt`, () => {
      const f = createFigure(mk());
      const s0 = figureCacheInfo().size;
      expect(f.setDetail(true)).toBe(true);
      const s1 = figureCacheInfo().size;
      expect(s1).toBe(s0 + 1);
      expect(f.setDetail(true)).toBe(true);
      expect(figureCacheInfo().size).toBe(s1);
      expect(f.setWinter(true)).toEqual({ hat: true, scarf: true });
      const s2 = figureCacheInfo().size;
      expect(f.setWinter(true)).toEqual({ hat: true, scarf: true });
      expect(figureCacheInfo().size).toBe(s2);
      expect(f.getDetail()).toBe(true);
      const g = createFigure(mk());
      g.setDetail(true);
      g.setWinter(true);
      expect(figureCacheInfo().size).toBe(s2);
      expect(g.mesh.geometry).toBe(f.mesh.geometry);
    });

    it(`${name}: Winter einzeln (nur Schal / nur Mütze) und aus`, () => {
      const f = createFigure(mk());
      const v0 = verts(f);
      f.setWinter({ hat: false, scarf: true });
      expect(verts(f)).toBeGreaterThan(v0);
      f.setWinter({ hat: true, scarf: false });
      expect(f.getWinter()).toEqual({ hat: true, scarf: false });
      expect(f.setWinter(null)).toBeNull();
      expect(verts(f)).toBe(v0);
    });

    it(`${name}: Schal am Spine-Bone, Mütze am Kopf-Bone, Finger und Absatz an den Glied-Bones`, () => {
      const f = createFigure(mk());
      f.setWinter(true);
      expect([...bonesAt(f, (x, y) => y > 1.77)]).toEqual([2]);
      const sc = bonesAt(f, (x, y, z) => x > 0.01 && x < 0.09 && y > 1.12 && y < 1.2 && z < -0.12);
      expect(sc.has(1)).toBe(true);
      f.setWinter(null);
      f.setDetail(true);
      expect([...bonesAt(f, (x, y) => x > 0.2 && y > 0.66 && y < 0.7)]).toEqual([4]);
      expect([...bonesAt(f, (x, y) => x < -0.2 && y > 0.66 && y < 0.7)]).toEqual([3]);
      expect([...bonesAt(f, (x, y, z) => x > 0.05 && y < 0.04 && z > 0.1)]).toEqual([6]);
      expect([...bonesAt(f, (x, y, z) => x < -0.05 && y < 0.04 && z > 0.1)]).toEqual([5]);
    });
  }

  it('vorhandener Hut: keine Mütze, nur Schal wirksam', () => {
    const f = createFigure(v2({ hat: { id: 'cap', color: [0.2, 0.8, 0.2] } }));
    expect(f.setWinter(true)).toEqual({ hat: false, scarf: true });
    const fo = createFigure({ ...oldLook(), hat: 'cap', hatColor: [0.2, 0.8, 0.2] });
    expect(fo.setWinter(true)).toEqual({ hat: false, scarf: true });
    expect(fo.setWinter({ hat: true, scarf: false })).toBeNull();
  });

  it('Look-Wechsel behält die Flags, Ich-Sicht ignoriert sie', () => {
    const f = createFigure(v2());
    f.setDetail(true);
    f.setLook(v2({ top: { cut: 'shirt', color: [0.2, 0.7, 0.4], pattern: 'plain', color2: [1, 1, 1] } }));
    expect(f.getDetail()).toBe(true);
    const detailed = verts(f);
    f.setEgo(true);
    const ego = verts(f);
    f.setEgo(false);
    expect(verts(f)).toBe(detailed);
    expect(ego).toBeLessThan(detailed);
  });

  it('Registry liveFigures: erzeugte Figuren drin, entsorgte nicht', () => {
    const f = createFigure(v2());
    expect(liveFigures()).toContain(f);
    f.dispose();
    expect(liveFigures()).not.toContain(f);
  });
});

describe('Abstands-LOD', () => {
  const fake = (x, z, ego = false) => {
    let d = false;
    return { disposed: false, root: { getWorldPosition: (o) => o.set(x, 0, z) }, getDetail: () => d, setDetail: (v) => { d = !!v; return d; }, isEgo: () => ego };
  };
  it('nah an, fern aus, Hysterese, Wechsellimit, ego/aus', () => {
    const near = fake(DETAIL_ON - 1, 0);
    const mid = fake((DETAIL_ON + DETAIL_OFF) / 2, 0);
    const far = fake(DETAIL_OFF + 5, 0);
    const ego = fake(1, 0, true);
    expect(stepFigureLod([near, mid, far, ego], 0, 0, 0)).toBe(1);
    expect([near.getDetail(), mid.getDetail(), far.getDetail(), ego.getDetail()]).toEqual([true, false, false, false]);
    mid.setDetail(true);
    expect(stepFigureLod([mid], 0, 0, 0)).toBe(0);
    expect(mid.getDetail()).toBe(true);
    expect(stepFigureLod([far, near], 30, 0, 0)).toBe(2);
    expect(far.getDetail()).toBe(true);
    expect(near.getDetail()).toBe(false);
    const many = Array.from({ length: 10 }, (_, i) => fake(i, 0));
    expect(stepFigureLod(many, 0, 0, 0)).toBe(MAX_SWAPS);
    expect(stepFigureLod(many, 0, 0, 0, { enabled: false })).toBe(MAX_SWAPS);
    expect(many.filter((m) => m.getDetail()).length).toBe(0);
  });
});

describe('Modul ultra-figures (Registry-Key figures)', () => {
  beforeEach(() => { for (const g of [...liveFigures()]) g.dispose(); }); // Wechsellimit: Reste früherer Tests nicht mitzählen
  function setup(level, dev) {
    const state = { level };
    const jobs = [];
    const ctx = { scene: new Scene(), camera: new PerspectiveCamera(), quality: () => state.level, opts: { ultraOk: true, ...(dev ? { dev } : {}) }, isPhone: false };
    const u = createUltra(ctx, { schedule: (fn) => { const j = { fn, cancel() {} }; jobs.push(j); return j; } });
    ctx.use = (n) => (n === 'ultra' ? u.api : undefined);
    const mod = ultraFigures.init(ctx);
    const flush = () => { while (jobs.length) jobs.shift().fn(1000); };
    const setLevel = (l) => { state.level = l; u.onQuality(l); mod.onQuality(); flush(); };
    return { ctx, u, mod, flush, setLevel };
  }
  it('registriert den Key figures; Detail nur solange er sichtbar ist (ultra)', () => {
    const f = createFigure(v2());
    const t = setup('high');
    expect(t.u.api.keys()).toEqual(['figures']);
    t.flush();
    t.mod.update(1);
    expect(f.getDetail()).toBe(false);
    t.setLevel('ultra');
    expect(f.getDetail()).toBe(true);
    t.setLevel('high'); // sofort aus
    expect(f.getDetail()).toBe(false);
    t.mod.dispose();
    expect(t.u.api.keys()).toEqual([]);
  });
  it('?ufx=-figures und ?ufx=only:neon schalten das Figuren-Detail ab, only:figures lässt es an', () => {
    for (const [ufx, want] of [['-figures', false], ['only:neon', false], ['only:figures', true], ['-neon', true]]) {
      const f = createFigure(v2());
      const t = setup('high', { ufx });
      t.flush();
      t.setLevel('ultra');
      t.mod.update(1);
      expect(f.getDetail(), ufx).toBe(want);
      t.mod.dispose();
      f.dispose();
    }
  });
  it('ohne Provider ultra: Rückfall auf die Stufe', () => {
    const f = createFigure(v2());
    const state = { level: 'ultra' };
    const mod = ultraFigures.init({ camera: new PerspectiveCamera(), quality: () => state.level, use: () => undefined });
    mod.update(1);
    expect(f.getDetail()).toBe(true);
    state.level = 'high';
    mod.onQuality();
    expect(f.getDetail()).toBe(false);
  });
});
