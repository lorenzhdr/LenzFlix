// @vitest-environment jsdom
// Friseursalon (1.17.0): Innenraum (Draw-Calls, Kollider, Navigation), Ablauf Stuhl/Umkleide mit Fake-Providern, Gabi und Ronny, Sprüche.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Group, Scene, PerspectiveCamera } from 'three';
import salonMod from '../src/js/store3d/modules/salon.js';
import { buildSalon, POSTER_NAMES } from '../src/js/store3d/world/build-salon.js';
import { rebuildNav } from '../src/js/store3d/world/layout.js';
import { isFree } from '../src/js/store3d/nav/path.js';
import { npcCodes, LINES, pickSalonLine } from '../src/js/store3d/char/salon-lines.js';
import { decode, toRender } from '../src/js/store3d/char/look2.js';
import { layoutOf, fakeCanvas } from './helpers-city.js';

beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function () { return fakeCanvas().getContext(); }); });
afterEach(() => { vi.restoreAllMocks(); });

function flood(nav, x, z) {
  const c0 = Math.floor((x - nav.ox) / nav.cell);
  const r0 = Math.floor((z - nav.oz) / nav.cell);
  const seen = new Uint8Array(nav.cols * nav.rows);
  const q = [r0 * nav.cols + c0];
  seen[q[0]] = 1;
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    const c = i % nav.cols;
    const r = (i - c) / nav.cols;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cc = c + dc;
      const rr = r + dr;
      if (cc < 0 || rr < 0 || cc >= nav.cols || rr >= nav.rows) continue;
      const k = rr * nav.cols + cc;
      if (seen[k] || nav.blocked[k]) continue;
      seen[k] = 1;
      q.push(k);
    }
  }
  return (x2, z2) => seen[Math.floor((z2 - nav.oz) / nav.cell) * nav.cols + Math.floor((x2 - nav.ox) / nav.cell)] === 1;
}

describe('Salon: Innenraum', () => {
  const L = layoutOf(80);
  const sa = L.city.salon;
  const built = buildSalon(sa);

  it('Spiegelfläche des Stuhls ist frei: kein Rahmen-/Wandkörper vor oder in der Spiegelebene innerhalb der Fläche', () => {
    const m = sa.mirror;
    const pos = built.meshes.solids.geometry.getAttribute('position');
    let bad = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i); const y = pos.getY(i); const z = pos.getZ(i);
      if (Math.abs(x - m.x) < m.w / 2 - 0.02 && Math.abs(y - m.y) < m.h / 2 - 0.02 && z > m.z - 0.05 && z < m.z + 0.011) bad++;
    }
    expect(bad).toBe(0);
  });

  it('setBrightness tönt die unbeleuchteten Materialien', () => {
    built.setBrightness(0.6);
    expect(built.meshes.solids.material.color.r).toBeCloseTo(0.6);
    built.setBrightness(1);
    expect(built.meshes.posters.material.color.g).toBeCloseTo(1);
  });

  it('wenige Draw-Calls: 3 Meshes im Innenraum (plus 2 Spiegelflächen und 2 Figuren = 7)', () => {
    const meshes = [];
    built.group.traverse((o) => { if (o.isMesh) meshes.push(o); });
    expect(meshes.length).toBe(3);
    expect(built.group.children.map((c) => c.name).sort()).toEqual(['salon-curtain', 'salon-posters', 'salon-solids']);
  });

  it('Plakate tragen erfundene Frisuren-Namen', () => {
    expect(POSTER_NAMES.length).toBe(4);
    for (const n of POSTER_NAMES) expect(n).toMatch(/^[A-ZÄÖÜ0-9 ]+$/);
  });

  it('Möbel liegen im Salon, nav-wirksam und ohne Überschneidung mit der Tür', () => {
    const r = sa.rect;
    for (const c of built.colliders) {
      expect(c.x0, c.id).toBeGreaterThanOrEqual(r.x0 - 0.08);
      expect(c.x1, c.id).toBeLessThanOrEqual(r.x1 + 1e-6);
      expect(c.z0, c.id).toBeGreaterThanOrEqual(r.z0);
      expect(c.z1, c.id).toBeLessThanOrEqual(r.z1 + 1e-6);
      expect(c.kind).toBe('prop');
      // Tür bleibt frei
      expect(c.z0 > sa.door.z + 0.6 || c.x1 <= sa.door.x0 || c.x0 >= sa.door.x1, c.id).toBe(true);
    }
  });

  it('Navigation: Tür, Stuhl-/Umkleide-Zugang, Theke, Rack und Umgebung der Figuren bleiben erreichbar', () => {
    const lay = layoutOf(80);
    const s = lay.city.salon;
    const b = buildSalon(s);
    const extra = [...b.colliders, ...['gabi', 'ronny'].map((k) => ({ x0: s[k].x - 0.28, z0: s[k].z - 0.28, x1: s[k].x + 0.28, z1: s[k].z + 0.28, y1: 1.8, kind: 'npc' }))];
    lay.colliders.push(...extra);
    rebuildNav(lay);
    const sp = lay.city.spawns;
    const reached = flood(lay.nav, sp.street.x, sp.street.z);
    expect(isFree(lay.nav, sp.salon.x, sp.salon.z)).toBe(true);
    expect(reached(sp.salon.x, sp.salon.z)).toBe(true);
    for (const [k, p] of Object.entries({
      chairExit: b.spots.chairExit, boothExit: b.spots.boothExit,
      beforeRack: { x: s.rack.x - 0.9, z: s.rack.z },
      beforeCounter: { x: s.rect.x0 + 1.5, z: s.rect.z0 + 1.6 },
      gabiSide: { x: s.gabi.x - 0.9, z: s.gabi.z },
      ronnyFront: { x: s.ronny.x + 0.8, z: s.ronny.z },
    })) {
      expect(isFree(lay.nav, p.x, p.z), k).toBe(true);
      expect(reached(p.x, p.z), k).toBe(true);
    }
    // die Kameraposition im Stuhl liegt im Salon, der Spiegel dahinter
    expect(b.spots.chair.camPos.z).toBeLessThan(s.mirror.z);
    expect(b.spots.booth.camPos.x).toBeLessThan(b.mirrors.booth.x);
    b.dispose();
  });

  it('Vorhang: 0 = zusammengeschoben, 1 = zu', () => {
    built.setCurtain(0);
    expect(built.curtainClosed()).toBe(false);
    built.setCurtain(1);
    expect(built.curtainClosed()).toBe(true);
  });
});

describe('Salon: Sprüche und Looks', () => {
  it('Looks gültig, v2, und markant (Dauerwelle/Vokuhila)', () => {
    const c = npcCodes();
    for (const k of ['gabi', 'ronny']) {
      expect(c[k].length).toBe(26);
      expect(decode(c[k])).toEqual(c[k]);
    }
    expect(toRender(c.gabi).hairStyle).toBe('curls');
    expect(toRender(c.ronny).hairStyle).toBe('mullet');
    expect(toRender(c.ronny).top.cut).toBe('jacket');
    expect(toRender(c.gabi).v).toBe(2);
  });

  it('viele Zeilen je Kategorie, keine Wiederholung direkt hintereinander, keine verbotenen Wörter', () => {
    for (const who of ['gabi', 'ronny']) {
      for (const cat of ['greet', 'idle', 'outfitNew', 'hairNew', 'leave', 'hit']) expect(LINES[who][cat].length, `${who}.${cat}`).toBeGreaterThanOrEqual(4);
    }
    expect(LINES.gabi.chair.length).toBeGreaterThanOrEqual(5);
    expect(LINES.ronny.booth.length).toBeGreaterThanOrEqual(5);
    const all = Object.values(LINES).flatMap((o) => Object.values(o).flat()).join(' ').toLowerCase();
    for (const bad of ['hautfarbe', 'fett', 'dick', 'hässlich', 'idiot', 'dumm', 'netflix', 'amazon']) expect(all.includes(bad), bad).toBe(false);
    const a = pickSalonLine('gabi', 'greet', () => 0, -1);
    const b = pickSalonLine('gabi', 'greet', () => 0, a.index);
    expect(b.index).not.toBe(a.index);
    expect(pickSalonLine('gabi', 'gibtsnicht')).toBe(null);
  });
});

// ---------------------------------------------------------------- Modul mit Fake-Providern
function setup({ quality = 'high', xr = false, noNpc = false, areaName = 'street' } = {}) {
  const L = layoutOf(80);
  const providers = new Map();
  const rec = { toasts: [], flights: [], teleports: [], freeze: [], release: 0, anims: [], editors: [], seen: [], sfx: [], said: [], speakerCalls: [], moves: [], profile: [], xrOpen: 0 };
  const colliders = [];
  const ias = [];
  let flyResolve = [];
  const flyTo = vi.fn((pos, target) => { rec.flights.push({ pos, target }); return new Promise((res) => { flyResolve.push(res); }); });
  const settleFlights = () => { const f = flyResolve; flyResolve = []; f.forEach((r) => r(true)); };
  const groups = { salonInterior: new Group(), street: new Group() };
  providers.set('city', { groups });
  providers.set('areas', { current: () => areaName, on: () => () => {} });
  const mkHandle = () => ({
    root: Object.assign(new Group(), {}), anim: { anim: 'idle' }, disposed: false,
    say: vi.fn((t) => rec.said.push(t)), hitReact: vi.fn(), setAnim: vi.fn(), lookAt: vi.fn(),
    dispose() { this.disposed = true; },
  });
  if (!noNpc) {
    providers.set('npc', {
      figure: vi.fn((o) => { const h = mkHandle(); h.root.position.set(o.pos.x, 0, o.pos.z); h.look = o.look; groups.salonInterior.add(h.root); h.root.visible = true; return h; }),
      registerPerson: vi.fn(() => () => {}),
    });
  }
  let editorResult = true;
  let editorResolve = null;
  const avatar = {
    openEditor: vi.fn((where, focus, o) => { rec.editors.push([where, focus, o]); return new Promise((res) => { editorResolve = (v) => res(v === undefined ? editorResult : v); }); }),
    changedFor: vi.fn(() => false),
    changeKind: vi.fn(() => null),
    markSeen: vi.fn((w) => rec.seen.push(w)),
    code: () => null,
  };
  providers.set('avatar', avatar);
  providers.set('selfview', { playAnim: vi.fn((n) => rec.anims.push(n)) });
  providers.set('sound', { play: (n) => rec.sfx.push(n) });
  providers.set('xrchar', { open: vi.fn(() => { rec.xrOpen++; return true; }) });
  const renderer = { info: { autoReset: true }, shadowMap: { autoUpdate: true }, getRenderTarget: () => null, setRenderTarget() {}, render() {} };
  const camera = new PerspectiveCamera(70, 1.6, 0.05, 120);
  let pose = { x: -18, z: L.city.salon.rect.z0 + 2, y: 0, yaw: Math.PI, pitch: 0 };
  const state = { q: quality, xr };
  const profileData = { evt: {} };
  const ctx = {
    layout: L, scene: new Scene(), camera, renderer, opts: {},
    deps: { toast: (t) => rec.toasts.push(t), profile: { get: () => profileData, update: (fn) => { fn(profileData); rec.profile.push(JSON.parse(JSON.stringify(profileData))); } } },
    quality: () => state.q,
    xr: { presenting: () => state.xr, toast: (t) => rec.toasts.push(t) },
    stage: { isStore: () => true },
    addCollider: (r) => { colliders.push(r); return r; },
    removeCollider: (r) => { const i = colliders.indexOf(r); if (i >= 0) colliders.splice(i, 1); },
    moveCollider: (r, x0, z0, x1, z1) => { rec.moves.push([x0, z0]); r.x0 = x0; r.z0 = z0; r.x1 = x1; r.z1 = z1; return r; },
    addInteractable: (o) => { ias.push(o); return () => { const i = ias.indexOf(o); if (i >= 0) ias.splice(i, 1); }; },
    player: {
      getPose: () => pose,
      eyeY: () => 1.65,
      teleport: vi.fn((x, z, yaw) => { rec.teleports.push([x, z, yaw]); pose = { ...pose, x, z }; }),
      freeze: vi.fn((on) => rec.freeze.push(on)),
      camera: { flyTo, release: vi.fn(() => { rec.release++; }) },
    },
    overlay: { isOpen: () => false, close: vi.fn() },
    track: (o) => o,
    provide: (n, impl) => { providers.set(n, impl); return () => { if (providers.get(n) === impl) providers.delete(n); }; },
    use: (n) => providers.get(n),
    on: () => () => {},
  };
  const probe = buildSalon(L.city.salon);
  const exitSpot = probe.spots.chairExit;
  const boothExit = probe.spots.boothExit;
  probe.dispose();
  return {
    exitSpot, boothExit, ctx, rec, colliders, ias, providers, avatar, groups, state, flyTo, settleFlights, setPose: (p) => { pose = { ...pose, ...p }; },
    finishEditor: (v) => editorResolve && editorResolve(v), setArea: (a) => { areaName = a; },
  };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const ia = (t, label) => t.ias.find((i) => i.label === label);

describe('Salon: Modul', () => {
  it('ohne Stadt: nur der Provider (busy/inside false)', () => {
    const t = setup();
    const h = salonMod.init({ ...t.ctx, layout: { w: 10, d: 10 } });
    const p = t.providers.get('salon');
    expect(p.busy()).toBe(false);
    expect(p.inside()).toBe(false);
    h.dispose();
    expect(t.providers.get('salon')).toBeUndefined();
  });

  it('legt Innenraum, Möbel-Kollider, zwei Interaktionen, zwei Figuren und zwei Spiegel an', () => {
    const t = setup();
    const h = salonMod.init(t.ctx);
    expect(t.groups.salonInterior.children.some((c) => c.name === 'salon-interior')).toBe(true);
    expect(t.ias.map((i) => i.label).sort()).toEqual(['Friseurstuhl', 'Umkleide']);
    expect(t.colliders.length).toBeGreaterThanOrEqual(10);
    const fig = t.providers.get('npc').figure;
    expect(fig).toHaveBeenCalledTimes(2);
    expect(fig.mock.calls[0][0].look.v).toBe(2);
    expect(fig.mock.calls[0][0].parent).toBe(t.groups.salonInterior);
    // Draw-Calls im Innenraum: 3 feste Meshes + 2 Spiegel (+ 2 Figuren) – ohne Figuren ≤ 6
    let n = 0;
    t.groups.salonInterior.traverse((o) => { if (o.isMesh) n++; });
    expect(n).toBeLessThanOrEqual(6);
    const calls = t.providers.get('npc').registerPerson.mock.calls.map((c) => c[0].kind).sort();
    expect(calls).toEqual(['salon-gabi', 'salon-ronny']);
    h.dispose();
    expect(t.colliders.length).toBe(0);
    expect(t.ias.length).toBe(0);
  });

  it('Stuhl: Ablauf mit Einfrieren, Kamerafahrt, Sitzen, Editor (live), Aufstehen; busy nur währenddessen', async () => {
    const t = setup({ quality: 'high' });
    const h = salonMod.init(t.ctx);
    const prov = t.providers.get('salon');
    const chairBox = ia(t, 'Friseurstuhl');
    expect(prov.busy()).toBe(false);
    chairBox.onUse();
    expect(prov.busy()).toBe(true);
    expect(prov.sitting()).toBe(true);
    expect(t.rec.freeze).toEqual([true]);
    expect(t.rec.anims).toEqual(['sit']);
    expect(t.rec.flights.length).toBe(1);
    expect(t.rec.teleports[0][0]).toBeCloseTo(t.ctx.layout.city.salon.chair.x);
    expect(t.rec.moves.length).toBe(1); // Stuhl-Kollider geparkt
    chairBox.onUse(); // zweiter Aufruf wird ignoriert
    expect(t.rec.flights.length).toBe(1);
    t.settleFlights();
    await tick();
    expect(t.avatar.openEditor).toHaveBeenCalledWith('chair', 'hair', { live: true });
    t.finishEditor(true);
    await tick();
    // Rückfahrt: Ziel ist die Austrittsstelle auf Augenhöhe (kein Sprung beim Freigeben)
    expect(t.rec.flights.length).toBe(2);
    const back = t.rec.flights[1];
    expect(back.pos.x).toBeCloseTo(t.exitSpot.x);
    expect(back.pos.z).toBeCloseTo(t.exitSpot.z);
    expect(back.pos.y).toBeCloseTo(1.65);
    expect(back.target.y).toBeCloseTo(back.pos.y);
    t.settleFlights();
    await tick();
    expect(prov.busy()).toBe(false);
    expect(prov.sitting()).toBe(false);
    expect(t.rec.anims).toEqual(['sit', 'idle']);
    expect(t.rec.release).toBeGreaterThanOrEqual(1);
    expect(t.rec.freeze).toEqual([true, false]);
    expect(t.rec.moves.length).toBe(2); // Kollider zurück
    expect(t.rec.seen).toContain('gabi');
    expect(t.rec.profile.length).toBe(1);
    expect(t.rec.profile[0].evt.salonChair).toBeGreaterThan(0);
    h.dispose();
  });

  it('Stuhl live: Kamera rahmt das Spiegelbild in die freie Fläche neben dem Blatt', async () => {
    const t = setup({ quality: 'high' });
    t.avatar.freeArea = () => ({ x0: 0.33, x1: 1, y0: 0, y1: 1 });
    t.ctx.camera.fov = 40;
    t.ctx.camera.aspect = 1.78;
    const h = salonMod.init(t.ctx);
    ia(t, 'Friseurstuhl').onUse();
    t.settleFlights();
    await tick();
    await new Promise((r) => setTimeout(r, 80)); // zwei Animationsbilder
    expect(t.rec.flights.length).toBe(2);
    const f = t.rec.flights[1];
    const sa = t.ctx.layout.city.salon;
    // Blickrichtung zeigt zum Spiegel (+z beim Stuhl, yaw π) und ist zur freien Fläche hin geschwenkt (nach +x)
    const dx = f.target.x - f.pos.x;
    const dz = f.target.z - f.pos.z;
    expect(dz).toBeGreaterThan(0);
    expect(dx).toBeGreaterThan(0);
    expect(f.pos.z).toBeLessThan(sa.mirror.z - 0.3); // Kamera bleibt vor dem Spiegel
    t.finishEditor(true);
    await tick();
    t.settleFlights();
    await tick();
    h.dispose();
  });

  it('Stuhl bei Qualität low: Editor ohne live (Studio)', async () => {
    const t = setup({ quality: 'low' });
    const h = salonMod.init(t.ctx);
    ia(t, 'Friseurstuhl').onUse();
    t.settleFlights();
    await tick();
    expect(t.avatar.openEditor).toHaveBeenCalledWith('chair', 'hair', undefined);
    t.finishEditor(false);
    await tick();
    t.settleFlights();
    await tick();
    expect(t.providers.get('salon').busy()).toBe(false);
    expect(t.rec.seen).not.toContain('gabi'); // abgebrochen: nichts zu kommentieren
    h.dispose();
  });

  it('Fehler im Editor räumt trotzdem auf (finally)', async () => {
    const t = setup();
    t.avatar.openEditor = vi.fn(() => Promise.reject(new Error('kaputt')));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const h = salonMod.init(t.ctx);
    ia(t, 'Friseurstuhl').onUse();
    t.settleFlights();
    await tick();
    expect(t.providers.get('salon').busy()).toBe(false);
    expect(t.rec.freeze).toEqual([true, false]);
    expect(t.rec.release).toBeGreaterThanOrEqual(1);
    expect(warn).toHaveBeenCalled();
    // der Körper steht an der Austrittsstelle, bevor der Stuhl-Kollider zurückkommt (nicht im Stuhl)
    const last = t.rec.teleports[t.rec.teleports.length - 1];
    expect(last[0]).toBeCloseTo(t.exitSpot.x);
    expect(last[1]).toBeCloseTo(t.exitSpot.z);
    expect(t.rec.moves.length).toBe(2);
    h.dispose();
  });

  it('Umkleide: Vorhang fährt zu und wieder auf, Editor booth/top, Ronny kommentiert', async () => {
    const t = setup({ quality: 'mid' });
    const h = salonMod.init(t.ctx);
    ia(t, 'Umkleide').onUse();
    expect(t.providers.get('salon').busy()).toBe(true);
    expect(t.providers.get('salon').sitting()).toBe(false);
    const cur = t.groups.salonInterior.getObjectByName('salon-curtain');
    expect(cur.scale.z).toBeCloseTo(0.12);
    for (let i = 0; i < 40; i++) h.update(0.05);
    expect(cur.scale.z).toBeCloseTo(1);
    expect(t.rec.sfx).toContain('whoosh');
    t.settleFlights();
    await tick();
    expect(t.avatar.openEditor).toHaveBeenCalledWith('booth', 'top', { live: true });
    t.finishEditor(true);
    await tick();
    t.settleFlights();
    await tick();
    expect(t.providers.get('salon').busy()).toBe(false);
    for (let i = 0; i < 40; i++) h.update(0.05);
    expect(cur.scale.z).toBeCloseTo(0.12);
    expect(t.rec.seen).toContain('ronny');
    h.dispose();
  });

  it('VR: Stuhl öffnet xrchar, kein Einfrieren; ohne xrchar ein Hinweis', () => {
    const t = setup({ xr: true });
    const h = salonMod.init(t.ctx);
    ia(t, 'Friseurstuhl').onUse();
    expect(t.rec.xrOpen).toBe(1);
    expect(t.rec.freeze.length).toBe(0);
    expect(t.providers.get('salon').busy()).toBe(false);
    t.providers.get('xrchar').open = () => false;
    ia(t, 'Umkleide').onUse();
    expect(t.rec.toasts.length).toBe(1);
    h.dispose();
  });

  it('dispose und onSuspend mitten im Ablauf lösen alles', async () => {
    const t = setup();
    const h = salonMod.init(t.ctx);
    ia(t, 'Friseurstuhl').onUse();
    h.onSuspend();
    expect(t.rec.teleports[t.rec.teleports.length - 1][0]).toBeCloseTo(t.exitSpot.x);
    expect(t.providers.get('salon').busy()).toBe(false);
    expect(t.rec.freeze).toEqual([true, false]);
    expect(t.rec.release).toBe(1);
    ia(t, 'Umkleide').onUse();
    h.dispose();
    expect(t.rec.freeze).toEqual([true, false, true, false]);
    t.settleFlights();
    await tick();
    expect(t.avatar.openEditor).not.toHaveBeenCalled();
  });

  it('Sprechen: Sprecher-Regie (cashier.speaker) mit „bubble“ → Blase; ohne Regie direkt Blase', async () => {
    const t = setup();
    const h = salonMod.init(t.ctx);
    const dbg = { say: null };
    // über den Eingang: Spieler im Salon, Begrüßung kommt über das areas-Ereignis; hier direkt über die Nähe-Reaktion
    t.avatar.changedFor = vi.fn((w) => w === 'ronny');
    t.setPose({ x: -20.5, z: t.ctx.layout.city.salon.rect.z0 + 2.4 });
    t.providers.set('areas', { current: () => 'salon', on: () => () => {} });
    const calls = [];
    t.providers.set('cashier', { speaker: (o) => { calls.push(o); return { say: vi.fn(() => Promise.resolve('bubble')), cancel() {} }; } });
    for (let i = 0; i < 40; i++) h.update(0.1);
    await tick();
    expect(calls.some((c) => c.id === 'ronny' && c.prio === 50 && typeof c.pos === 'function')).toBe(true);
    expect(t.rec.said.length).toBeGreaterThanOrEqual(1);
    expect(t.rec.seen).toContain('ronny');
    expect(LINES.ronny.outfitNew.some((l) => t.rec.said.includes(l))).toBe(true);
    void dbg;
    h.dispose();
  });

  it('Gabi kommentiert eine neue Frisur mit einer hairNew-Zeile', async () => {
    const t = setup();
    let hair = [2, 3, 10, 10, 0, 0, 1, 0, 1, 0, 0, 1, 0, 6, 0, 13, 0, 11, 0, 1, 1, 0, 0, 0, 0, 0];
    t.avatar.code = () => hair;
    const h = salonMod.init(t.ctx);
    hair = hair.slice();
    hair[5] = 7;
    t.avatar.changedFor = vi.fn((w) => w === 'gabi');
    t.avatar.changeKind = vi.fn((w) => (w === 'gabi' ? 'hair' : null));
    t.setPose({ x: -18, z: t.ctx.layout.city.salon.rect.z0 + 3.4 });
    t.providers.set('areas', { current: () => 'salon', on: () => () => {} });
    for (let i = 0; i < 20; i++) h.update(0.1);
    await tick();
    expect(LINES.gabi.hairNew.some((l) => t.rec.said.includes(l))).toBe(true);
    h.dispose();
  });

  it('ohne npc-Provider: Salon läuft ohne Figuren (kein Absturz)', () => {
    const t = setup({ noNpc: true });
    const h = salonMod.init(t.ctx);
    h.update(0.1);
    h.dispose();
  });
});
