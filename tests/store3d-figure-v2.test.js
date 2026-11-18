// @vitest-environment jsdom
// Figur v2 (1.17.0): Render-Look v2 über npc/figure-parts.js – alle Optionen bauen, genau 1 SkinnedMesh, jede Option/Farbe ändert die Geometrie,
// Polygonbudget, setLook, topY, Ego, Material-Hook, Handnaht. Der alte Pfad ist durch store3d-figure-baseline.test.js abgesichert.
import { describe, it, expect, afterEach, afterAll, vi } from 'vitest';
import { createFigure, disposeFigureCaches, HAND_R } from '../src/js/store3d/npc/figure.js';
import { makeLook } from '../src/js/store3d/npc/looks.js';
import { seeded } from '../src/js/store3d/modules/m4-util.js';
import { MeshLambertMaterial } from 'three';
import {
  HAIR_STYLES, EYES, BROWS, BEARDS, SHAPES, TOP_CUTS, TOP_PATTERNS, BOTTOM_CUTS, BOTTOM_PATTERNS, SHOE_MODELS, GLASSES, HATS, BAGS,
  UNLOCK_TOPS, UNLOCK_BOTTOMS, UNLOCK_SHOES, UNLOCK_GLASSES, UNLOCK_HATS, UNLOCK_BAGS, UNLOCK_PENDING,
} from '../src/js/store3d/char/ids.js';

const baseLook = () => ({
  v: 2,
  skin: [0.9, 0.7, 0.55], height: 1, build: 1, shape: 'straight',
  hairStyle: 'short', hair: [0.24, 0.13, 0.1],
  eyes: 'dot', brows: 'none', beard: 'none',
  top: { cut: 'tee', color: [0.85, 0.2, 0.2], pattern: 'plain', color2: [0.95, 0.95, 0.95] },
  bottom: { cut: 'jeans', color: [0.14, 0.16, 0.3], pattern: 'plain', color2: [0.9, 0.9, 0.2] },
  shoes: { model: 'sneaker', color: [0.1, 0.1, 0.12], sole: [0.92, 0.92, 0.94] },
  glasses: 'none',
  hat: { id: 'none', color: [0.8, 0.2, 0.2] },
  bag: { id: 'none', color: [0.3, 0.3, 0.4] },
  handItem: null,
});
const withs = (fn) => { const l = baseLook(); fn(l); return l; };

const fnv = (str) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
};
function sig(look) {
  const f = createFigure(look);
  const g = f.mesh.geometry;
  let acc = '';
  for (const n of ['position', 'color']) { const a = g.attributes[n].array; for (let i = 0; i < a.length; i++) acc += `${Math.round(a[i] * 1e4)},`; }
  const out = `${g.attributes.position.count}:${fnv(acc)}`;
  f.dispose();
  return out;
}
const tris = (look) => { const f = createFigure(look); const n = f.mesh.geometry.index.count / 3; f.dispose(); return n; };

afterEach(() => vi.restoreAllMocks());
afterAll(() => disposeFigureCaches());

describe('Figur v2: alle Optionen bauen', () => {
  const cases = [
    ['hairStyle', HAIR_STYLES, (l, v) => { l.hairStyle = v; }],
    ['eyes', EYES, (l, v) => { l.eyes = v; }],
    ['brows', BROWS, (l, v) => { l.brows = v; }],
    ['beard', BEARDS, (l, v) => { l.beard = v; }],
    ['shape', SHAPES, (l, v) => { l.shape = v; }],
    ['top.cut', [...TOP_CUTS, ...UNLOCK_TOPS.filter((x) => !UNLOCK_PENDING.includes(x))], (l, v) => { l.top.cut = v; }],
    ['top.pattern', TOP_PATTERNS, (l, v) => { l.top.pattern = v; }],
    ['bottom.cut', [...BOTTOM_CUTS, ...UNLOCK_BOTTOMS], (l, v) => { l.bottom.cut = v; }],
    ['bottom.pattern', BOTTOM_PATTERNS, (l, v) => { l.bottom.pattern = v; }],
    ['shoes.model', [...SHOE_MODELS, ...UNLOCK_SHOES], (l, v) => { l.shoes.model = v; }],
    ['glasses', [...GLASSES, ...UNLOCK_GLASSES.filter((x) => !UNLOCK_PENDING.includes(x))], (l, v) => { l.glasses = v; }],
    ['hat.id', [...HATS, ...UNLOCK_HATS.filter((x) => !UNLOCK_PENDING.includes(x))], (l, v) => { l.hat.id = v; }],
    ['bag.id', [...BAGS, ...UNLOCK_BAGS.filter((x) => !UNLOCK_PENDING.includes(x))], (l, v) => { l.bag.id = v; }],
  ];
  const baseSig = sig(baseLook());

  for (const [name, ids, set] of cases) {
    it(`${name}: ${ids.length} Werte bauen, 1 SkinnedMesh, Geometrie unterscheidet sich vom Standard`, () => {
      const base = baseLook();
      const baseVal = name.split('.').reduce((o, k) => o[k], base);
      const seen = new Set();
      for (const id of ids) {
        const l = baseLook();
        set(l, id);
        const f = createFigure(l);
        let skinned = 0;
        f.root.traverse((o) => { if (o.isSkinnedMesh) skinned++; });
        expect(skinned).toBe(1);
        expect(f.bones.armR).toBeTruthy();
        const a = f.mesh.geometry.attributes.position.array;
        expect(a.every(Number.isFinite)).toBe(true);
        expect(f.mesh.geometry.attributes.skinIndex.count).toBe(f.mesh.geometry.attributes.position.count);
        f.dispose();
        const s = sig(l);
        if (id !== baseVal && !(typeof baseVal === 'object')) expect(s, `${name}=${id} gleicht dem Standard`).not.toBe(baseSig);
        seen.add(s);
      }
      expect(seen.size, `${name}: doppelte Geometrien`).toBe(ids.length);
    });
  }

  it('jede Farbe ändert die Geometrie', () => {
    const c1 = [0.31, 0.62, 0.93];
    const c2 = [0.62, 0.31, 0.12];
    const variants = [
      (l, c) => { l.skin = c; },
      (l, c) => { l.hair = c; },
      (l, c) => { l.top.color = c; },
      (l, c) => { l.top.pattern = 'chest'; l.top.color2 = c; },
      (l, c) => { l.bottom.color = c; },
      (l, c) => { l.bottom.pattern = 'stripe'; l.bottom.color2 = c; },
      (l, c) => { l.shoes.color = c; },
      (l, c) => { l.shoes.sole = c; },
      (l, c) => { l.hat.id = 'cap'; l.hat.color = c; },
      (l, c) => { l.bag.id = 'backpack'; l.bag.color = c; },
    ];
    variants.forEach((v, i) => {
      expect(sig(withs((l) => v(l, c1))), `Farbvariante ${i}`).not.toBe(sig(withs((l) => v(l, c2))));
    });
  });

  it('Höhe/Statur ändern die Geometrie nicht (nur Rig-Skalierung), gleicher Cache-Eintrag', () => {
    const a = createFigure(withs((l) => { l.height = 0.9; l.build = 0.85; }));
    const b = createFigure(withs((l) => { l.height = 1.1; l.build = 1.25; }));
    expect(a.mesh.geometry).toBe(b.mesh.geometry);
    expect(a.rig.scale.y).toBeCloseTo(0.9);
    expect(b.rig.scale.x).toBeCloseTo(1.1 * 1.25);
    a.dispose(); b.dispose();
  });

  it('unbekannte IDs zeichnen als Standard', () => {
    const unknown = withs((l) => {
      l.hairStyle = '???'; l.eyes = 'x'; l.brows = 'x'; l.beard = 'x'; l.shape = 'x';
      l.top.cut = 'nope'; l.top.pattern = 'nope'; l.bottom.cut = 'nope'; l.bottom.pattern = 'nope';
      l.shoes.model = 'nope'; l.glasses = 'nope'; l.hat.id = 'nope'; l.bag.id = 'nope';
    });
    const std = sig(baseLook());
    const g = createFigure(unknown);
    expect(g.mesh.geometry.attributes.position.count).toBe(Number(std.split(':')[0]));
    g.dispose();
    // Fehlende/kaputte Teilobjekte werfen nicht
    expect(() => createFigure({ v: 2, skin: [1, 0, 0] }).dispose()).not.toThrow();
  });
});

describe('Figur v2: Polygonbudget', () => {
  it('Standard-v2 und das schwerste Outfit bleiben höchstens 2,5× der alten Figur', () => {
    const olds = Array.from({ length: 12 }, (_, i) => tris(makeLook(seeded(500 + i), {})));
    const ref = olds.reduce((a, b) => a + b, 0) / olds.length;
    const limit = 2.5 * ref;
    expect(tris(baseLook())).toBeLessThan(limit);
    // jede Option einzeln und ein überladenes Outfit
    const heavy = withs((l) => {
      l.shape = 'hips'; l.hairStyle = 'curls'; l.eyes = 'wide'; l.brows = 'angry'; l.beard = 'full';
      l.top = { cut: 'hoodie', color: [0.5, 0.5, 0.2], pattern: 'check', color2: [1, 1, 1] };
      l.bottom = { cut: 'cargo', color: [0.2, 0.3, 0.2], pattern: 'check', color2: [1, 1, 1] };
      l.shoes.model = 'boot'; l.glasses = 'pilot'; l.hat = { id: 'crown', color: [1, 0.8, 0.2] }; l.bag = { id: 'vhspack', color: [0.2, 0.2, 0.2] };
    });
    expect(tris(heavy)).toBeLessThan(limit);
    for (const cut of UNLOCK_TOPS) expect(tris(withs((l) => { l.top.cut = cut; }))).toBeLessThan(limit);
    for (const id of UNLOCK_HATS) expect(tris(withs((l) => { l.hat.id = id; }))).toBeLessThan(limit);
    // feste Obergrenze (gemessen): schützt vor schleichendem Wachstum
    expect(ref).toBeGreaterThan(100);
    expect(Math.max(tris(heavy), tris(baseLook()))).toBeLessThan(1500);
  });
});

describe('Figur v2: Handle', () => {
  it('setLook tauscht nur die Geometrie (gleiche Bones), setzt Rig-Skalierung und Look neu', () => {
    const f = createFigure(baseLook());
    const bones = f.mesh.skeleton.bones.slice();
    const g0 = f.mesh.geometry;
    const next = withs((l) => { l.hairStyle = 'afro'; l.height = 1.08; l.build = 1.2; });
    f.setLook(next);
    expect(f.mesh.geometry).not.toBe(g0);
    expect(f.look).toBe(next);
    expect(f.mesh.skeleton.bones.length).toBe(7);
    expect(f.mesh.skeleton.bones.every((b, i) => b === bones[i])).toBe(true);
    expect(f.rig.scale.y).toBeCloseTo(1.08);
    expect(f.rig.scale.x).toBeCloseTo(1.08 * 1.2);
    f.update(0.1);
    f.dispose();
  });

  it('topY steigt mit Hut; headWorld richtet sich nach topY (v2), Alt-Look bleibt bei 1,95 × height', () => {
    const a = createFigure(baseLook());
    const b = createFigure(withs((l) => { l.hat.id = 'hat'; }));
    const c = createFigure(withs((l) => { l.hat.id = 'crown'; l.height = 1.1; }));
    expect(b.topY).toBeGreaterThan(a.topY);
    expect(c.topY).toBeGreaterThan(b.topY * 1.05 * 0.99);
    expect(a.headWorld().y).toBeGreaterThan(a.topY);
    expect(b.headWorld().y).toBeGreaterThan(b.topY);
    expect(b.headWorld().y).toBeGreaterThan(a.headWorld().y);
    const old = createFigure(makeLook(seeded(7), {}));
    expect(old.headWorld().y).toBeCloseTo(1.95 * old.look.height, 10);
    for (const f of [a, b, c, old]) f.dispose();
  });

  it('Namensschild: v2 über der Oberkante, Alt-Look bei 1,98', () => {
    const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
    const tagOf = (f) => f.rig.children.find((o) => o !== f.mesh && o.material && o.material.map);
    const old = createFigure(makeLook(seeded(3), {}), { name: 'Anna' });
    expect(tagOf(old).position.y).toBe(1.98);
    const hat = createFigure(withs((l) => { l.hat.id = 'crown'; }), { name: 'Bo' });
    const bare = createFigure(baseLook(), { name: 'Bo' });
    expect(tagOf(hat).position.y).toBeGreaterThan(tagOf(bare).position.y);
    hat.setLook(baseLook());
    expect(tagOf(hat).position.y).toBeCloseTo(tagOf(bare).position.y, 10);
    for (const f of [old, hat, bare]) f.dispose();
  });

  it('Ego (v2): nur Beine/Schuhe als eigene Geometrie, gekippt vor der Kamera, enge Hüllkugel, Lage bleibt auch nach Rückstoß', () => {
    const full = createFigure(baseLook());
    const f = createFigure(baseLook(), { ego: true });
    expect(f.isEgo()).toBe(true);
    expect(f.bones.head.scale.x).toBe(0);
    expect(f.bones.armL.scale.y).toBe(0);
    expect(f.bones.armR.scale.z).toBe(0);
    expect(f.bones.spine.scale.x).toBe(1);
    expect(f.mesh.boundingSphere.radius).toBeCloseTo(0.55);
    expect(f.mesh.boundingSphere.center.y).toBeCloseTo(0.5);
    // eigene Geometrie ohne Hals/Torso/Kopf: deutlich weniger Dreiecke, Oberkante weit unter der vollen Figur, topY bleibt die der vollen Figur
    expect(f.mesh.geometry).not.toBe(full.mesh.geometry);
    expect(f.mesh.geometry.index.count).toBeLessThan(full.mesh.geometry.index.count * 0.4);
    const ys = f.mesh.geometry.attributes.position.array;
    let maxY = 0;
    for (let i = 1; i < ys.length; i += 3) maxY = Math.max(maxY, ys[i]);
    expect(maxY).toBeLessThan(0.9);
    expect(f.topY).toBeCloseTo(full.topY, 5);
    // Beine vor der Kamera: Rig um den Fuß nach hinten gekippt, Hüfte nur knapp hinter der Kamera
    const lean = f.rig.rotation.x;
    const z0 = f.rig.position.z;
    expect(lean).toBeGreaterThan(0.2);
    expect(z0).toBeLessThan(0);
    f.hitReact({ x: 1, z: 0 });
    for (let i = 0; i < 400; i++) f.update(0.05);
    expect(f.rig.position.z).toBeCloseTo(z0);
    expect(f.rig.rotation.x).toBeCloseTo(lean);
    f.setEgo(false);
    expect(f.bones.head.scale.x).toBe(1);
    expect(f.rig.position.z).toBe(0);
    expect(f.rig.rotation.x).toBe(0);
    expect(f.mesh.geometry).toBe(full.mesh.geometry);
    expect(f.mesh.boundingSphere.radius).toBeCloseTo(1.6);
    f.setEgo(true);
    f.setLook(baseLook());
    expect(f.mesh.geometry).not.toBe(full.mesh.geometry); // Look-Tausch behält die Ego-Geometrie
    f.dispose();
    full.dispose();
  });

  it('Ego (alter Pfad): Rig 0,12 m nach hinten, Geometrie unverändert (Kopf/Arme per Bone-Skalierung)', () => {
    const olds = makeLook(seeded(501), {});
    const plain = createFigure(olds);
    const f = createFigure(olds, { ego: true });
    expect(f.mesh.geometry).toBe(plain.mesh.geometry);
    expect(f.bones.head.scale.x).toBe(0);
    expect(f.rig.position.z).toBeCloseTo(0.12);
    expect(f.rig.rotation.x).toBe(0);
    f.hitReact({ x: 1, z: 0 });
    for (let i = 0; i < 400; i++) f.update(0.05);
    expect(f.rig.position.z).toBeCloseTo(0.12);
    f.setEgo(false);
    expect(f.rig.position.z).toBe(0);
    f.dispose();
    plain.dispose();
  });

  it('hooks.material wird benutzt und beim dispose nicht entsorgt', () => {
    const mat = new MeshLambertMaterial({ vertexColors: true });
    const spy = vi.spyOn(mat, 'dispose');
    const f = createFigure(baseLook(), { material: mat });
    expect(f.mesh.material).toBe(mat);
    f.dispose();
    expect(spy).not.toHaveBeenCalled();
    mat.dispose();
  });

  it('1.18-Naht: HAND_R und setHandItem (No-op)', () => {
    expect(HAND_R.bone).toBe('armR');
    expect(HAND_R.offset).toEqual([0.04, -0.5, -0.12]);
    const f = createFigure(baseLook());
    expect(f.setHandItem('x')).toBeNull();
    expect(f.setHandItem(null)).toBeNull();
    f.dispose();
  });
});
