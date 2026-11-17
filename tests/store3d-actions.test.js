// VIDEOTHEK LENZ: Aktionen (ctx.input.onAction), Ereignisse (hit/throw/jump/zoneExit/leave/return), Kollider-API, doUse-Reihenfolge.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { MODULES } from '../src/js/store3d/modules/index.js';
import { ModuleHost } from '../src/js/store3d/modules/runtime.js';
import { StoreApp } from '../src/js/store3d/store.js';
import { Player } from '../src/js/store3d/controls/player.js';
import { buildLayout } from '../src/js/store3d/world/layout.js';
import { createColliderIndex } from '../src/js/store3d/nav/collide.js';
import { isFree } from '../src/js/store3d/nav/path.js';

const depts = [
  { id: 'new', label: 'Neuheiten', kind: 'new', color: '#f00', itemIds: ['a', 'b'] },
  { id: 'genre-x', label: 'X', kind: 'genre', color: '#0f0', itemIds: Array.from({ length: 80 }, (_, i) => `g${i}`) },
];

function fakeApp() {
  const layout = buildLayout(depts);
  const player = new Player(layout);
  return {
    layout, deps: { catalog: {}, toast() {} }, opts: {}, phone: false, touch: false, sound: false, xr: null,
    engine: { scene: {}, camera: new PerspectiveCamera(), renderer: {}, preset: { level: 'mid' } },
    player,
  };
}

afterEach(() => { MODULES.length = 0; });

describe('ModuleHost.action', () => {
  it('Priorität absteigend, dann Anmeldereihenfolge; true verbraucht', () => {
    const h = new ModuleHost(fakeApp());
    const order = [];
    const mk = (name, ret) => () => { order.push(name); return ret; };
    h.ctx.input.onAction('use', mk('a', false));
    h.ctx.input.onAction('use', mk('b', false), { prio: 5 });
    h.ctx.input.onAction('use', mk('c', true), { prio: 5 });
    h.ctx.input.onAction('use', mk('d', true));
    expect(h.action('use', { name: 'use' })).toBe(true);
    expect(order).toEqual(['b', 'c']);
  });
  it('kein Handler / alle false = nicht verbraucht; Beobachter bekommt (ev, consumed)', () => {
    const h = new ModuleHost(fakeApp());
    const seen = vi.fn();
    h.ctx.on('hit', seen);
    const ev = { name: 'hit', source: 'key' };
    expect(h.action('hit', ev)).toBe(false);
    expect(seen).toHaveBeenLastCalledWith(ev, false);
    h.ctx.input.onAction('hit', () => true);
    expect(h.action('hit', ev)).toBe(true);
    expect(seen).toHaveBeenLastCalledWith(ev, true);
    const thr = vi.fn();
    h.ctx.on('throw', thr);
    h.action('throw', { name: 'throw' });
    expect(thr).toHaveBeenCalledTimes(1);
  });
  it('Ausnahme im Handler blockiert die anderen nicht; off() entfernt', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const h = new ModuleHost(fakeApp());
    h.ctx.input.onAction('use', () => { throw new Error('boom'); }, { prio: 9 });
    const ok = vi.fn(() => true);
    const off = h.ctx.input.onAction('use', ok);
    expect(h.action('use', {})).toBe(true);
    expect(ok).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
    off();
    expect(h.action('use', {})).toBe(false);
    h.dispose();
    warn.mockRestore();
  });
  it('nur Funktionen werden angenommen', () => {
    const h = new ModuleHost(fakeApp());
    expect(typeof h.ctx.input.onAction('use', null)).toBe('function');
    expect(h.action('use', {})).toBe(false);
  });
});

describe('ctx Kollider-API', () => {
  it('addCollider statisch: Hash + Nav-Neuaufbau; mit Höhe nur Hash ohne Nav (Dach)', () => {
    const app = fakeApp();
    const h = new ModuleHost(app);
    const L = app.layout;
    const sp = L.spawn;
    const wall = { x0: sp.x - 0.5, z0: sp.z - 3, x1: sp.x + 0.5, z1: sp.z - 2 };
    h.ctx.addCollider(wall);
    expect(L.colliders).toContain(wall);
    expect(L.cidx.has(wall)).toBe(true);
    expect(h.navDirty).toBe(true);
    h.flushNav();
    expect(isFree(L.nav, sp.x, sp.z - 2.5)).toBe(false);
    const roof = { x0: 1, z0: 1, x1: 3, z1: 3, y0: 3, y1: 3.2 };
    h.ctx.addCollider(roof);
    expect(h.navDirty).toBe(false);
    expect(L.cidx.has(roof)).toBe(true);
    h.ctx.removeCollider(wall);
    expect(L.cidx.has(wall)).toBe(false);
    expect(L.colliders).not.toContain(wall);
  });
  it('dynamic: nur layout.dyn, nie navDirty; moveCollider und removeCollider', () => {
    const app = fakeApp();
    const h = new ModuleHost(app);
    const L = app.layout;
    const car = { x0: 1, z0: 1, x1: 3, z1: 2 };
    h.ctx.addCollider(car, { dynamic: true });
    expect(car.dynamic).toBe(true);
    expect(L.dyn.has(car)).toBe(true);
    expect(L.colliders).not.toContain(car);
    expect(L.cidx.has(car)).toBe(false);
    expect(h.navDirty).toBe(false);
    h.ctx.moveCollider(car, 5, 5, 7, 6);
    expect([car.x0, car.z0, car.x1, car.z1]).toEqual([5, 5, 7, 6]);
    expect(h.navDirty).toBe(false);
    h.ctx.removeCollider(car);
    expect(L.dyn.has(car)).toBe(false);
  });
  it('moveCollider sortiert statische Kollider im Hash neu ein', () => {
    const app = fakeApp();
    const h = new ModuleHost(app);
    const crate = { x0: 1, z0: 1, x1: 2, z1: 2 };
    h.ctx.addCollider(crate);
    h.ctx.moveCollider(crate, 40, 40, 41, 41, 0, 0.5);
    const near = [];
    app.layout.cidx.query(40, 40, 41, 41, (q) => near.push(q));
    expect(near).toContain(crate);
    expect(crate.y1).toBe(0.5);
  });
  it('Layout hat bounds, cidx und dyn; rebuildNav baut den Hash neu', () => {
    const L = buildLayout(depts);
    expect(L.bounds).toEqual(L.city.bounds); // seit 1.15.0: ganze Welt (Laden = zones.store)
    expect(L.zones.store.rect).toMatchObject({ x0: 0, z0: 0, x1: L.w, z1: L.d });
    expect(L.cidx.size).toBe(L.colliders.length);
    expect(L.dyn).toBeInstanceOf(Set);
  });
  it('Spieler läuft mit Index gegen Regale wie mit Array (Äquivalenz)', () => {
    const L = buildLayout(depts);
    const a = new Player(L);
    const b = new Player({ colliders: L.colliders, spawn: L.spawn });
    a.yaw = b.yaw = 0.7;
    for (let i = 0; i < 300; i++) { a.update(1 / 60, { fwd: 1, strafe: 0.3, run: true }); b.update(1 / 60, { fwd: 1, strafe: 0.3, run: true }); }
    expect([a.x, a.z]).toEqual([b.x, b.z]);
    expect(createColliderIndex(L.colliders).size).toBe(L.colliders.length);
  });
});

describe('ctx.player', () => {
  it('getPose hat y; jump, knock, eyeY, getY, isGrounded', () => {
    const app = fakeApp();
    const h = new ModuleHost(app);
    const pl = h.ctx.player;
    expect(pl.getPose()).toMatchObject({ y: 0 });
    expect(pl.eyeY()).toBeCloseTo(1.65, 9);
    expect(pl.isGrounded()).toBe(true);
    expect(pl.jump()).toBe(true);
    for (let i = 0; i < 20; i++) app.player.update(1 / 60, null);
    expect(pl.getY()).toBeGreaterThan(0.3);
    expect(pl.isGrounded()).toBe(false);
    expect(pl.eyeY()).toBeGreaterThan(1.95);
    expect(pl.knock({ x: 1, z: 0 }, 1)).toBe(true);
    expect(app.player.knockVx).toBeGreaterThan(0);
    pl.teleport(5, 5, 0, 0);
    expect(app.player.x).toBe(5);
  });
  it('in VR: jump und knock ohne Wirkung', () => {
    const app = fakeApp();
    app.xr = { presenting: true };
    const h = new ModuleHost(app);
    expect(h.ctx.player.jump()).toBe(false);
    expect(h.ctx.player.knock({ x: 1, z: 0 })).toBe(false);
    expect(app.player.knockVx).toBe(0);
    expect(app.player.jumpBuf).toBe(0);
  });
});

describe('Zonen: zone, zoneExit, leave, return', () => {
  it('zoneExit beim Verlassen; leave/return an der Innenraum-Grenze (Zone store, sonst Grundriss)', () => {
    const app = fakeApp();
    const h = new ModuleHost(app);
    const L = app.layout;
    const log = [];
    for (const e of ['zone', 'zoneExit', 'leave', 'return']) h.ctx.on(e, (id) => log.push([e, id]));
    const p = app.player;
    h.checkZones(); // Spawn: im Eingang, Innenraum
    expect(log).toContainEqual(['zone', 'entrance']);
    expect(log.some(([e]) => e === 'leave' || e === 'return')).toBe(false);
    log.length = 0;
    p.x = L.w / 2; p.z = L.d / 2 - 0.3; // anderer Ort im Laden
    h.checkZones();
    expect(log).toContainEqual(['zoneExit', 'entrance']);
    log.length = 0;
    p.x = L.w + 3;
    h.checkZones();
    expect(log).toContainEqual(['leave', undefined]);
    log.length = 0;
    h.checkZones();
    expect(log.length).toBe(0); // nur bei Wechsel
    p.x = L.w / 2;
    h.checkZones();
    expect(log).toContainEqual(['return', undefined]);
  });
  it('Zone store (Rect) hat Vorrang; Zonen mit Höhe prüfen y nur wenn gesetzt', () => {
    const app = fakeApp();
    const h = new ModuleHost(app);
    const L = app.layout;
    L.zones.store = { id: 'store', rect: { x0: 0, z0: 0, x1: 5, z1: 5 } };
    L.zones.roof = { id: 'roof', rect: { x0: 20, z0: 20, x1: 30, z1: 30, y0: 3, y1: 4 } };
    L.zones.flat = { id: 'flat', rect: { x0: 20, z0: 20, x1: 30, z1: 30 } };
    const log = [];
    h.ctx.on('zone', (id) => log.push(id));
    h.ctx.on('leave', () => log.push('leave'));
    const p = app.player;
    p.x = 2; p.z = 2;
    h.checkZones();
    p.x = 25; p.z = 25; // außerhalb von store, y = 0
    h.checkZones();
    expect(log).toContain('flat');
    expect(log).not.toContain('roof');
    expect(log).toContain('leave');
    p.y = 3.2;
    h.checkZones();
    expect(log).toContain('roof');
  });
});

/** StoreApp ohne Konstruktor (kein WebGL): nur die Aktionslogik. */
function appStub(extra = {}) {
  const mods = { locked: false, interactables: [], action: vi.fn(() => false), emit: vi.fn() };
  const app = Object.assign(Object.create(StoreApp.prototype), {
    mode: 'play', disposed: false, xr: null, aim: null, carried: null,
    mods, take: vi.fn(), openCarried: vi.fn(),
    player: { y: 0, swing: vi.fn(), jump: vi.fn(() => true) },
    hands: { swing: vi.fn(), throwAnim: vi.fn() },
    engine: { camera: new PerspectiveCamera() },
    _d: new Vector3(),
    ...extra,
  });
  return { app, mods };
}

describe('StoreApp: doUse-Reihenfolge und Aktionen', () => {
  it('Ziel (Hülle) gewinnt vor allen Handlern', () => {
    const { app, mods } = appStub({ aim: { info: { itemId: 'x' } } });
    expect(app.doUse('key')).toBe(true);
    expect(app.take).toHaveBeenCalledWith('x');
    expect(mods.action).not.toHaveBeenCalled();
  });
  it('Interaktion am Ziel: onUse; ohne anyHeight nur am Boden (y <= 0,5)', () => {
    const ia = { onUse: vi.fn(), anyHeight: false };
    const { app, mods } = appStub({ aim: { ia } });
    expect(app.doUse('key')).toBe(true);
    expect(ia.onUse).toHaveBeenCalledTimes(1);
    app.player.y = 1;
    expect(app.doUse('key')).toBe(false);
    expect(ia.onUse).toHaveBeenCalledTimes(1);
    expect(mods.action).toHaveBeenCalledWith('use', expect.objectContaining({ name: 'use', source: 'key' }));
    ia.anyHeight = true;
    expect(app.doUse('key')).toBe(true);
    expect(ia.onUse).toHaveBeenCalledTimes(2);
  });
  it('kein Ziel: use-Handler, dann getragene Hülle öffnen (nicht bei Klick), Klick -> hit', () => {
    const { app, mods } = appStub();
    mods.action.mockImplementation((n) => n === 'use');
    expect(app.doUse('touch')).toBe(true);
    expect(app.openCarried).not.toHaveBeenCalled();
    mods.action.mockImplementation(() => false);
    app.carried = { id: 'c' };
    expect(app.doUse('touch')).toBe(true);
    expect(app.openCarried).toHaveBeenCalledTimes(1);
    app.openCarried.mockClear();
    app.carried = null;
    mods.action.mockClear();
    app.doUse('click');
    expect(mods.action.mock.calls.map((c) => c[0])).toEqual(['use', 'hit']);
    expect(mods.action.mock.calls[1][1].source).toBe('click');
    expect(app.player.swing).toHaveBeenCalled();
    expect(app.hands.swing).toHaveBeenCalled();
    mods.action.mockClear();
    app.carried = { id: 'c' };
    app.doUse('click'); // Klick öffnet die getragene Hülle nicht, schlägt
    expect(app.openCarried).not.toHaveBeenCalled();
    expect(mods.action.mock.calls.map((c) => c[0])).toEqual(['use', 'hit']);
  });
  it('doHit/doThrow/doJump: Ereignisform, getragene Hülle im Wurf', () => {
    const { app, mods } = appStub();
    app.doHit('key');
    const ev = mods.action.mock.calls[0][1];
    expect(ev).toMatchObject({ name: 'hit', source: 'key', aim: null });
    expect(ev.origin).toBeInstanceOf(Vector3);
    expect(ev.dir).toBeInstanceOf(Vector3);
    app.carried = { id: 'c', item: { Id: 'c' } };
    app.doThrow('touch');
    const t = mods.action.mock.calls[1];
    expect(t[0]).toBe('throw');
    expect(t[1].carried).toEqual({ id: 'c', item: { Id: 'c' } });
    expect(app.hands.throwAnim).toHaveBeenCalled();
    expect(app.doJump()).toBe(true);
    expect(app.player.jump).toHaveBeenCalledTimes(1);
  });
  it('nur im Laufmodus, ohne Modulsperre, nie in VR', () => {
    const { app, mods } = appStub();
    app.mode = 'hold';
    expect([app.doUse(), app.doHit(), app.doThrow(), app.doJump()]).toEqual([false, false, false, false]);
    app.mode = 'play';
    mods.locked = true;
    expect(app.doHit()).toBe(false);
    mods.locked = false;
    app.xr = { presenting: true };
    expect([app.doJump(), app.doHit(), app.doUse()]).toEqual([false, false, false]);
    expect(app.player.jump).not.toHaveBeenCalled();
    expect(mods.action).not.toHaveBeenCalled();
  });
  it('groundIas: in der Luft nur anyHeight', () => {
    const a = { anyHeight: false };
    const b = { anyHeight: true };
    const { app, mods } = appStub();
    mods.interactables = [a, b];
    expect(app.groundIas()).toEqual([a, b]);
    app.player.y = 0.6;
    expect(app.groundIas()).toEqual([b]);
  });
});
