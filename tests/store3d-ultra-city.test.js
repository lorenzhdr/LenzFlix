// @vitest-environment jsdom
// Ultra-Außenwelt (world/ultra-plan.js, world/build-city-ultra.js, modules/ultra-city.js): keine Kollider, keine Geometrie in Laufwegen/Türen/Spawns,
// Materialien über out.tint, nur auf 'ultra' sichtbar, Draw-Call-Budget, dispose.
import { describe, it, expect, vi } from 'vitest';
import { Group, Mesh, InstancedMesh, Scene, PerspectiveCamera } from 'three';
import { layoutOf, overlap } from './helpers-city.js';
import { createUltra } from '../src/js/store3d/engine/ultra.js';
import { planUltraCity, groundFootprints, makeKeepout, doorRects, curbRuns, SKY_RADII } from '../src/js/store3d/world/ultra-plan.js';

const fakeOut = { group: null, tinted: [], hooks: [], tod: 'day', rain: false, pal: { shade: [1, 1, 1], sky: [[0.3, 0.5, 0.9], [0.5, 0.7, 0.95], [0.85, 0.94, 1]] } };
fakeOut.tint = (mat, base = [1, 1, 1]) => { fakeOut.tinted.push({ mat, base }); return mat; };
vi.mock('../src/js/store3d/modules/outdoor.js', async (orig) => ({ ...(await orig()), getOutdoor: () => fakeOut }));
const { default: ultraCityModule } = await import('../src/js/store3d/modules/ultra-city.js');

const sqr = (v) => v * v;
const circleRect = (x, z, r, q) => sqr(Math.max(q.x0 - x, 0, x - q.x1)) + sqr(Math.max(q.z0 - z, 0, z - q.z1)) < r * r;
function segDist(x, z, a, b) {
  const dx = b.x - a.x; const dz = b.z - a.z; const l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2)) : 0;
  return Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
}

for (const n of [80, 600]) {
  describe(`Ultra-Plan Außenwelt (${n} Titel)`, () => {
    const L = layoutOf(n);
    const before = L.colliders.length;
    const plan = planUltraCity(L);
    const c = L.city;

    it('legt keine Kollider an und verändert das Layout nicht', () => {
      expect(L.colliders.length).toBe(before);
      expect(plan.trees.length).toBeGreaterThan(3);
      expect(plan.street.bins.length).toBeGreaterThan(0);
      expect(plan.street.signs.length).toBeGreaterThan(0);
      expect(plan.street.hoops.length).toBeGreaterThan(0);
      expect(plan.facade.windows.length).toBeGreaterThan(20);
    });

    it('bodennahe Teile: nicht in Kollidern, ≥ 0,6 m von Fußweg-Pfaden, nicht an Türen/Zonen/Spawns/Slots', () => {
      const hits = [];
      for (const f of groundFootprints(plan)) {
        const hug = f.kind === 'bin' || f.kind === 'hoop' || f.kind === 'pipe';
        for (const q of L.colliders) if (q.kind !== 'bounds' && circleRect(f.x, f.z, f.r + (hug ? 0.01 : 0.05), q)) hits.push(`${f.kind}@${f.x},${f.z} Kollider ${q.id || q.kind}`);
        for (const p of c.sidewalkPaths) for (let i = 0; i + 1 < p.pts.length; i++) if (segDist(f.x, f.z, p.pts[i], p.pts[i + 1]) < 0.6 + f.r - 1e-6) hits.push(`${f.kind}@${f.x},${f.z} Pfad ${p.id}`);
        for (const id of ['doorway', 'theft', 'palastEntrance', 'kiosk', 'alley', 'salon']) if (circleRect(f.x, f.z, f.r, c.zones[id].rect)) hits.push(`${f.kind}@${f.x},${f.z} Zone ${id}`);
        for (const d of doorRects(c)) if (circleRect(f.x, f.z, f.r, d)) hits.push(`${f.kind}@${f.x},${f.z} Haustür`);
        for (const [id, s] of Object.entries(c.spawns)) if (Math.hypot(f.x - s.x, f.z - s.z) < f.r + 1.4) hits.push(`${f.kind}@${f.x},${f.z} Spawn ${id}`);
        for (const s of [...c.discoverSlots, ...c.propSlots]) if (Math.hypot(f.x - s.x, f.z - s.z) < f.r + 0.9) hits.push(`${f.kind}@${f.x},${f.z} Platz ${s.id}`);
        if (L.facade && L.facade.door && f.x > L.facade.door.x0 - 0.8 && f.x < L.facade.door.x1 + 0.8 && f.z > L.d - 0.5 && f.z < L.d + 1.6) hits.push(`${f.kind}@${f.x},${f.z} Ladentür`);
      }
      expect(hits).toEqual([]);
    });

    it('Bäume und Teile untereinander ohne Überlappung', () => {
      const fp = groundFootprints(plan);
      for (let i = 0; i < fp.length; i++) for (let j = i + 1; j < fp.length; j++) {
        if (fp[i].kind === 'hoop' && fp[j].kind === 'hoop') continue;
        expect(Math.hypot(fp[i].x - fp[j].x, fp[i].z - fp[j].z), `${fp[i].kind}/${fp[j].kind}`).toBeGreaterThan(fp[i].r + fp[j].r);
      }
    });

    it('Freihalte-Prüfung meldet Pfad, Tür und Spawn als blockiert', () => {
      const k = makeKeepout(L);
      expect(k.blocked(L.w / 2, c.frame.D + 1.2, 0.1)).toBe(true); // Gehweg-Pfad vor dem Laden
      expect(k.blocked(c.spawns.street.x, c.spawns.street.z, 0.1)).toBe(true);
      expect(k.blocked(L.w / 2, c.frame.D + 0.3, 0.1)).toBe(true); // Ladentür
    });

    it('solide Bordsteine der Seitenstraßen liegen auf keiner Querung (Fußwege, Zebras, Türen, Zonen, Spawns, Kollider)', () => {
      const keep = makeKeepout(L);
      const solid = plan.street.curbs.filter((q) => q.solid);
      expect(solid.length).toBeGreaterThanOrEqual(4);
      const hits = [];
      for (const q of solid) {
        for (let z = q.z0 + 0.05; z < q.z1; z += 0.1) {
          if (keep.blocked(q.x - q.dir * 0.08, z, 0.1, 'hug')) hits.push(`x${q.x.toFixed(2)} z${z.toFixed(2)}`);
          for (const zb of c.zebras) if (circleRect(q.x - q.dir * 0.08, z, 0.1, zb)) hits.push(`Zebra ${zb.id} z${z.toFixed(2)}`);
          for (const p of c.sidewalkPaths) for (let i = 0; i + 1 < p.pts.length; i++) if (segDist(q.x - q.dir * 0.08, z, p.pts[i], p.pts[i + 1]) < 0.6) hits.push(`Pfad ${p.id} z${z.toFixed(2)}`);
        }
      }
      expect(hits).toEqual([]);
    });

    it('curbRuns unterbricht an einer zusätzlichen Querung und lässt kurze Reste weg', () => {
      const f = c.frame;
      const zMid = (f.zSN + f.D) / 2;
      const L2 = { ...L, city: { ...c, sidewalkPaths: [...c.sidewalkPaths, { id: 'testCross', pts: [{ x: f.xc0 - 4, z: zMid }, { x: f.xc0 + 3, z: zMid }], waits: [null] }] } };
      const plan2 = planUltraCity(L2);
      const segs = plan2.street.curbs.filter((q) => q.solid && q.x === f.xc0);
      expect(segs.length).toBeGreaterThanOrEqual(2);
      for (const q of segs) expect(zMid < q.z0 - 0.5 || zMid > q.z1 + 0.5).toBe(true);
      const free = { blocked: (x, z) => z > 2 && z < 3 };
      expect(curbRuns(free, 0, 0, 5, 1)).toEqual([[0, 2], [3, 5]]);
      expect(curbRuns({ blocked: (x, z) => z > 0.3 }, 0, 0, 5, 1)).toEqual([]); // Rest 0,25 m < 0,5 m
    });

    it('Skyline: drei Ringe zwischen 52 und 56 m, gestaffelte Höhen', () => {
      const sk = plan.skyline;
      expect(sk.blds.length).toBeGreaterThan(60);
      for (const b of sk.blds) {
        const r = Math.hypot(b.x, b.z); // relativ zum Ringmittelpunkt
        expect(r).toBeGreaterThan(SKY_RADII[0] - 0.5);
        expect(r).toBeLessThan(SKY_RADII[2] + 0.5);
      }
      const maxH = [0, 1, 2].map((l) => Math.max(...sk.blds.filter((b) => b.layer === l).map((b) => b.h)));
      expect(maxH[2]).toBeGreaterThan(maxH[0]);
      expect(sk.follow).toBeGreaterThanOrEqual(0.9);
      expect(sk.follow).toBeLessThanOrEqual(1);
    });

    it('deterministisch', () => {
      expect(JSON.stringify(planUltraCity(L))).toBe(JSON.stringify(plan));
    });
  });
}

describe('Modul ultra-city (Registry-Integration)', () => {
  function setup(level = 'mid') {
    const L = layoutOf(80);
    const state = { level };
    const scene = new Scene();
    const root = new Group();
    const street = new Group();
    const yard = new Group();
    root.add(street, yard);
    scene.add(root);
    const camera = new PerspectiveCamera();
    const jobs = [];
    const ctx = {
      scene, camera, layout: L, quality: () => state.level, opts: { ultraOk: true }, isPhone: false,
      addCollider: vi.fn(), removeCollider: vi.fn(),
    };
    const u = createUltra(ctx, { schedule: (fn) => { const j = { fn, cancel() { this.c = true; } }; jobs.push(j); return j; } });
    const providers = { ultra: u.api, city: { groups: { street, yard } }, areas: { current: () => 'street' } };
    ctx.use = (n) => providers[n];
    const flush = () => { while (jobs.length) { const j = jobs.shift(); if (!j.c) j.fn(1000); } };
    const mod = ultraCityModule.init(ctx);
    return { L, state, scene, camera, root, street, yard, u, ctx, mod, flush, setLevel: (l) => { state.level = l; u.onQuality(l); } };
  }

  it('registriert die vier Keys; baut erst ab high, sichtbar nur auf ultra', () => {
    fakeOut.tinted.length = 0;
    const t = setup('mid');
    expect(t.u.api.keys()).toEqual(['facade', 'street', 'trees', 'skyline']);
    t.flush();
    expect(t.u.api.list().every((e) => !e.built)).toBe(true);
    t.setLevel('high');
    t.flush();
    const l = t.u.api.list();
    expect(l.every((e) => e.built && !e.visible)).toBe(true);
    t.setLevel('ultra');
    expect(t.u.api.list().every((e) => e.visible)).toBe(true);
    t.setLevel('mid');
    expect(t.u.api.list().every((e) => !e.visible)).toBe(true);
    t.setLevel('ultra');
    expect(t.u.api.list().every((e) => e.visible)).toBe(true);
    for (const e of l) expect(e.ms).toBeLessThan(5000);
    expect(t.ctx.addCollider).not.toHaveBeenCalled();
  });

  it('Kollider-Anzahl vor/nach gleich; ≤ 8 Draw-Calls; Außenmaterialien in out.tinted', () => {
    fakeOut.tinted.length = 0;
    fakeOut.hooks.length = 0;
    const t = setup('ultra');
    const n0 = t.L.colliders.length;
    t.flush();
    expect(t.L.colliders.length).toBe(n0);
    let draws = 0;
    t.root.traverse((o) => { if (o.isMesh || o.isInstancedMesh) draws++; });
    expect(draws).toBeGreaterThan(3);
    expect(draws).toBeLessThanOrEqual(8);
    const mats = new Set();
    t.root.traverse((o) => { if ((o.isMesh) && o.material && o.name !== 'ultra-skyline') mats.add(o.material); });
    for (const m of mats) expect(fakeOut.tinted.some((q) => q.mat === m), m.type).toBe(true);
    expect(fakeOut.hooks.length).toBe(1); // Skyline färbt sich selbst (Himmel-Muster)
  });

  it('update spiegelt Bereichsgruppen; Skyline folgt der Kamera und ist im Saal aus', () => {
    const t = setup('ultra');
    t.flush();
    t.camera.position.set(10, 1.7, 20);
    t.u.update(0.016, 1);
    const sky = t.root.getObjectByName('ultra-skyline');
    expect(sky.visible).toBe(true);
    const px = sky.position.x;
    t.camera.position.set(30, 1.7, 20);
    t.u.update(0.016, 1);
    expect(sky.position.x).toBeGreaterThan(px);
    t.yard.visible = false;
    t.street.visible = false;
    t.u.update(0.016, 1);
    for (const nm of ['ultra-facade-street', 'ultra-facade-yard', 'ultra-street-mesh']) { const o = t.root.getObjectByName(nm); if (o) expect(o.visible).toBe(false); }
    t.street.visible = true;
    t.u.update(0.016, 1);
    expect(t.root.getObjectByName('ultra-facade-street').visible).toBe(true);
  });

  it('Teilmesh-Sichtbarkeit stimmt sofort beim Sichtbarwerden (ohne update)', () => {
    const t = setup('high');
    t.flush();
    t.street.visible = false;
    t.yard.visible = false;
    t.setLevel('ultra'); // kein update() dazwischen
    const m = t.root.getObjectByName('ultra-street-mesh');
    if (m) expect(m.visible).toBe(false);
    const f = t.root.getObjectByName('ultra-facade-street');
    expect(f).toBeTruthy();
    expect(f.visible).toBe(false);
  });

  it('dispose entfernt alles, räumt out.tinted und Hooks', () => {
    fakeOut.tinted.length = 0;
    fakeOut.hooks.length = 0;
    const t = setup('ultra');
    t.flush();
    const meshes = [];
    t.root.traverse((o) => { if (o.isMesh) meshes.push(o); });
    expect(meshes.length).toBeGreaterThan(3);
    t.mod.dispose();
    const left = [];
    t.root.traverse((o) => { if (o.isMesh) left.push(o); });
    expect(left.length).toBe(0);
    expect(fakeOut.tinted.length).toBe(0);
    expect(fakeOut.hooks.length).toBe(0);
    expect(t.u.api.keys()).toEqual([]);
  });

  it('ohne Stadt oder ohne Provider tut das Modul nichts', () => {
    const r1 = ultraCityModule.init({ layout: { }, use: () => undefined });
    const r2 = ultraCityModule.init({ layout: layoutOf(80), use: () => undefined });
    expect(r1).toEqual({});
    expect(r2).toEqual({});
  });
});

void overlap; void Mesh; void InstancedMesh;
