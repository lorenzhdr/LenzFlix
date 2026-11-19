// @vitest-environment jsdom
// Ultra-Innenraum (1.19.0): Texturtausch, Plakate/Kleinkram/Lampen/Staub nur auf ultra, keine Kollider, nichts in Interaktionsboxen.
import { describe, it, expect, vi } from 'vitest';
import { Scene, Mesh, BoxGeometry, MeshBasicMaterial, MeshLambertMaterial } from 'three';
import { createUltra } from '../src/js/store3d/engine/ultra.js';
import { buildLayout } from '../src/js/store3d/world/layout.js';
import { makeTextures } from '../src/js/store3d/world/textures.js';
import { posterSpots, clutterBoxes, shelfTags, lampSpecs, dustPoints, knownInteractBoxes } from '../src/js/store3d/world/room-ultra-logic.js';
import { buildPosters } from '../src/js/store3d/world/build-room-ultra.js';
import ultraRoom from '../src/js/store3d/modules/ultra-room.js';

const ctxStub = new Proxy({}, {
  get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : () => ({ width: 10, addColorStop() {} })),
  set: (t, k, v) => { t[k] = v; return true; },
});
HTMLCanvasElement.prototype.getContext = () => ctxStub;

const depts = [
  { id: 'a', label: 'Action', kind: 'free', color: '#ff0000', itemIds: Array.from({ length: 40 }, (_, i) => `a${i}`) },
  { id: 'b', label: 'Komödie', kind: 'free', color: '#00ff00', itemIds: Array.from({ length: 30 }, (_, i) => `b${i}`) },
  { id: 'k', label: 'Kinder', kind: 'kids', color: '#0000ff', itemIds: Array.from({ length: 20 }, (_, i) => `k${i}`) },
];

function setup(level = 'high', dev) {
  const layout = buildLayout(depts, {});
  const scene = new Scene();
  const tex = makeTextures({ anisotropy: 4 });
  const mats = {
    carpet: new MeshBasicMaterial({ map: tex.carpet }),
    wallpaper: new MeshLambertMaterial({ map: tex.wallpaper }),
    wood: new MeshLambertMaterial({ map: tex.wood }),
    ceiling: new MeshBasicMaterial({ map: tex.ceiling }),
  };
  for (const m of Object.values(mats)) scene.add(new Mesh(new BoxGeometry(1, 1, 1), m));
  const state = { level };
  const addCollider = vi.fn();
  const ctx = {
    scene, layout, quality: () => state.level, opts: { ultraOk: true, ...(dev ? { dev } : {}) }, isPhone: false, addCollider, addInteractable: vi.fn(),
    renderer: { capabilities: { getMaxAnisotropy: () => 8 }, domElement: { height: 800 } }, camera: { fov: 70 },
  };
  const jobs = [];
  const u = createUltra(ctx, { schedule: (fn) => { const j = { fn, cancel() { this.c = true; } }; jobs.push(j); return j; } });
  const shell = { on: true }; // Sichtbarkeit der Ladenhülle (modules/city.js shellVisible)
  ctx.use = (n) => (n === 'ultra' ? u.api : n === 'city' ? { shellVisible: () => shell.on } : undefined);
  const flush = () => { while (jobs.length) { const j = jobs.shift(); if (!j.c) j.fn(1000); } };
  const handle = ultraRoom.init(ctx);
  const setLevel = (l) => { state.level = l; u.onQuality(l); flush(); };
  return { layout, scene, tex, mats, ctx, u, flush, setLevel, handle, addCollider, shell };
}

describe('Ultra-Innenraum folgt dem Bereichs-Culling der Ladenhülle (W7 p2)', () => {
  const GATED = ['posters', 'clutter', 'lamps', 'dust'];
  const vis = (t) => Object.fromEntries(t.u.api.list().map((e) => [e.key, e.visible]));
  it('Plakate: Atlas kommt als eigener Teilschritt; bis dahin bleibt das Mesh unsichtbar (keine weißen Flächen)', () => {
    const layout = buildLayout(depts, {});
    const api = buildPosters(layout, { aniso: 4 });
    const mesh = api.object.children[0];
    expect(mesh.visible).toBe(false);
    expect(mesh.material.map).toBeNull();
    expect(api.textures).toEqual([]);
    expect(api.more()).toBe(false); // genau ein Schritt
    expect(mesh.visible).toBe(true);
    expect(mesh.material.map).toBe(api.textures[0]);
    expect(api.more()).toBe(false);
    api.dispose();
  });
  it('Hülle ausgeblendet: Plakate, Kleinkram, Lampen, Staub unsichtbar (0 Draw-Calls), Texturen bleiben getauscht', () => {
    const t = setup('ultra');
    t.flush();
    t.u.update(0.016, 1);
    for (const k of GATED) expect(vis(t)[k], k).toBe(true);
    const swapped = Object.values(t.mats).map((m) => m.map);
    t.shell.on = false;
    t.u.update(0.016, 1.1);
    for (const k of GATED) expect(vis(t)[k], k).toBe(false);
    expect(Object.values(t.mats).map((m) => m.map)).toEqual(swapped);
    t.shell.on = true;
    t.u.update(0.016, 1.2);
    for (const k of GATED) expect(vis(t)[k], k).toBe(true);
  });
  it('Staub-Update läuft nicht, solange die Hülle weg ist', () => {
    const t = setup('ultra');
    t.flush();
    const dust = t.scene.getObjectByName('ultra-dust') || t.scene.children.find((o) => o.isPoints);
    expect(dust).toBeTruthy();
    t.shell.on = false;
    t.u.update(0.016, 1);
    expect(dust.visible).toBe(false);
  });
  it('Texturen entstehen in Teilschritten (eine je Häppchen) und sind danach vollständig', () => {
    const layoutT = setup('high');
    // setup() spült schon alles: alle sechs Schlüssel müssen jetzt getauscht werden können
    layoutT.setLevel('ultra');
    for (const m of Object.values(layoutT.mats)) expect(m.map.image.width).toBe(512);
  });
});

describe('Ultra-Innenraum', () => {
  it('registriert alle fünf Schlüssel und baut sie erst ab high', () => {
    const t = setup('mid');
    expect(t.u.api.keys().sort()).toEqual(['clutter', 'dust', 'lamps', 'posters', 'tex']);
    t.flush();
    expect(t.u.api.list().every((e) => !e.built)).toBe(true);
    t.setLevel('high');
    expect(t.u.api.list().every((e) => e.built && !e.visible)).toBe(true);
  });

  it('tauscht die Texturen bei Ultra gegen 512² und beim Verlassen zurück; alte Texturen bleiben unverändert', () => {
    const t = setup('high');
    t.flush();
    const old = { carpet: t.tex.carpet, wallpaper: t.tex.wallpaper, wood: t.tex.wood, ceiling: t.tex.ceiling };
    const sizes = Object.fromEntries(Object.entries(old).map(([k, v]) => [k, [v.image.width, v.image.height]]));
    expect(sizes.carpet).toEqual([256, 256]);
    t.setLevel('ultra');
    for (const [k, m] of Object.entries(t.mats)) {
      expect(m.map).not.toBe(old[k]);
      expect(m.map.image.width).toBe(512);
      expect(m.map.image.height).toBe(512);
      expect(m.map.wrapS).toBe(old[k].wrapS);
    }
    for (const [k, v] of Object.entries(old)) expect([v.image.width, v.image.height]).toEqual(sizes[k]);
    t.setLevel('high');
    for (const [k, m] of Object.entries(t.mats)) expect(m.map).toBe(old[k]);
    t.setLevel('ultra'); // zweiter Tausch funktioniert
    expect(t.mats.carpet.map.image.width).toBe(512);
  });

  it('erzeugt die 512²-Texturen schon im Leerlauf-Bau (vor dem Wechsel auf Ultra)', () => {
    const t = setup('mid');
    t.setLevel('high'); // gebaut, aber nicht sichtbar
    const sp = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    t.setLevel('ultra');
    expect(sp).not.toHaveBeenCalled();
    sp.mockRestore();
    expect(t.mats.carpet.map.image.width).toBe(512);
  });

  it('zieht spät entstandene Materialien nach und lässt verworfene los', () => {
    const t = setup('high');
    t.flush();
    t.setLevel('ultra');
    const late = new MeshLambertMaterial({ map: t.tex.wood });
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), late);
    t.scene.add(mesh);
    t.u.update(0.5, 1);
    expect(late.map).toBe(t.tex.wood); // noch nicht fällig
    t.u.update(2, 2);
    expect(late.map.image.width).toBe(512);
    t.scene.remove(mesh);
    t.u.update(2.5, 3);
    t.setLevel('high');
    expect(late.map.image.width).toBe(512); // verworfenes Teil wird nicht mehr angefasst
    expect(t.mats.wood.map).toBe(t.tex.wood);
  });

  it('ufx=-tex lässt die alten Texturen stehen', () => {
    const t = setup('high', { ufx: '-tex' });
    t.flush();
    t.setLevel('ultra');
    expect(t.mats.carpet.map).toBe(t.tex.carpet);
    expect(t.u.api.list().find((e) => e.key === 'posters').visible).toBe(true);
  });

  it('Details sind unter ultra sichtbar, sonst nicht; update läuft nur sichtbar', () => {
    const t = setup('high');
    t.flush();
    t.setLevel('ultra');
    expect(t.u.api.list().every((e) => e.built && e.visible)).toBe(true);
    t.u.update(0.016, 5);
    const dust = t.scene.getObjectByName('ultra-dust');
    expect(dust.material.uniforms.uTime.value).toBe(5);
    t.setLevel('high');
    expect(t.u.api.list().every((e) => !e.visible)).toBe(true);
    t.u.update(0.016, 9);
    expect(dust.material.uniforms.uTime.value).toBe(5);
  });

  it('legt keine Kollider und keine Interaktionen an', () => {
    const t = setup('high');
    const n = t.layout.colliders.length;
    t.flush();
    t.setLevel('ultra');
    expect(t.addCollider).not.toHaveBeenCalled();
    expect(t.ctx.addInteractable).not.toHaveBeenCalled();
    expect(t.layout.colliders.length).toBe(n);
  });

  it('dispose stellt die Texturen wieder her und gibt die neuen frei', () => {
    const t = setup('high');
    t.flush();
    t.setLevel('ultra');
    const neu = t.mats.carpet.map;
    const spy = vi.spyOn(neu, 'dispose');
    const oldDispose = vi.spyOn(t.tex.carpet, 'dispose');
    t.handle.dispose();
    expect(t.mats.carpet.map).toBe(t.tex.carpet);
    expect(spy).toHaveBeenCalled();
    expect(oldDispose).not.toHaveBeenCalled();
    expect(t.u.api.keys()).toEqual([]);
    expect(t.scene.getObjectByName('ultra-posters')).toBeUndefined();
  });

  it('Draw-Calls: höchstens 5 Meshes/Points zusammen', () => {
    const t = setup('high');
    t.flush();
    t.setLevel('ultra');
    let n = 0;
    for (const k of ['ultra-posters', 'ultra-clutter', 'ultra-lamps', 'ultra-dust', 'ultra-tex']) {
      t.scene.getObjectByName(k).traverse((o) => { if (o.isMesh || o.isPoints) n++; });
    }
    expect(n).toBeLessThanOrEqual(5);
  });
});

describe('Staub und Reduced-Motion', () => {
  const realMM = globalThis.matchMedia;
  function fakeMM(initial) {
    const l = new Set();
    const mq = { matches: initial, addEventListener: (n, f) => { if (n === 'change') l.add(f); }, removeEventListener: (n, f) => { if (n === 'change') l.delete(f); } };
    globalThis.matchMedia = () => mq;
    return { mq, l, set(v) { mq.matches = v; for (const f of [...l]) f({ matches: v }); } };
  }
  it('reagiert auf Änderungen der Systemeinstellung und räumt den Listener in dispose auf', () => {
    const m = fakeMM(false);
    try {
      const t = setup('ultra');
      t.flush();
      const dust = t.scene.getObjectByName('ultra-dust');
      t.u.update(0.016, 2);
      expect(dust.material.uniforms.uTime.value).toBe(2);
      m.set(true); // jetzt reduziert: Staub steht still
      t.u.update(0.016, 7);
      expect(dust.material.uniforms.uTime.value).toBe(2);
      m.set(false);
      t.u.update(0.016, 9);
      expect(dust.material.uniforms.uTime.value).toBe(9);
      expect(m.l.size).toBe(1);
      t.handle.dispose();
      expect(m.l.size).toBe(0);
    } finally { globalThis.matchMedia = realMM; }
  });
  it('startet statisch, wenn reduziert schon beim Bau gilt', () => {
    fakeMM(true);
    try {
      const t = setup('ultra');
      t.flush();
      t.u.update(0.016, 5);
      expect(t.scene.getObjectByName('ultra-dust').material.uniforms.uTime.value).toBe(0);
    } finally { globalThis.matchMedia = realMM; }
  });
});

describe('Ultra-Innenraum Platzierung', () => {
  const layout = buildLayout(depts, {});
  const hit = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0 && a.y0 < b.y1 && a.y1 > b.y0;

  // Hinweis: knownInteractBoxes (room-ultra-logic.js) ist eine handgepflegte Spiegelung der addInteractable-Boxen aus modules/cashier.js (Terminal/Richard/Rückgabe)
  // und modules/props.js/snack.js (Reservierung usw.). Sie direkt abzuleiten ginge nur über das Hochfahren der vollen Module mit Voll-ctx (Jellyfin-, Audio-, Figuren-Abhängigkeiten);
  // das ist für eine Gegenprobe unverhältnismäßig. Ändert sich dort eine Box, hier knownInteractBoxes nachziehen.
  it('Kleinkram liegt nicht in Interaktionsboxen und bleibt auf Tresen bzw. Boden', () => {
    const boxes = knownInteractBoxes(layout);
    const cn = layout.counter;
    for (const b of clutterBoxes(layout)) {
      const a = { x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2, y0: b.y - b.h / 2, y1: b.y + b.h / 2 };
      for (const q of boxes) expect(hit(a, q), `${q.name} @ ${b.x.toFixed(2)},${b.z.toFixed(2)}`).toBe(false);
      if (b.mat) { expect(a.y1).toBeLessThan(0.02); continue; }
      expect(a.y0).toBeGreaterThanOrEqual(1.09);
      expect(a.x0).toBeGreaterThanOrEqual(cn.x0);
      expect(a.x1).toBeLessThanOrEqual(cn.x1);
      expect(a.z0).toBeGreaterThanOrEqual(cn.z0);
      expect(a.z1).toBeLessThanOrEqual(cn.z1);
    }
  });

  it('Plakate hängen an Wänden im Raum, Schilder, Lampen und Staub liegen im Raum', () => {
    const ps = posterSpots(layout);
    expect(ps.length).toBeGreaterThan(3);
    for (const p of ps) {
      expect(p.x).toBeGreaterThan(0.2);
      expect(p.x).toBeLessThan(layout.w - 0.2);
      expect(p.y - p.h / 2).toBeGreaterThan(0.95);
      expect(p.y + p.h / 2).toBeLessThan(layout.ceilH - 0.5);
      expect(p.z === 0.035 || Math.abs(p.z - (layout.d - 0.035)) < 1e-9).toBe(true);
    }
    expect(shelfTags(layout).length).toBeGreaterThan(20);
    expect(lampSpecs(layout).halos.length).toBe(layout.panels.length);
    const d = dustPoints(layout, 200);
    expect(d.length).toBe(200);
    for (const p of d) { expect(p.y).toBeGreaterThan(0.6); expect(p.y).toBeLessThan(2.9); }
  });
});
