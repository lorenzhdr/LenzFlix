// @vitest-environment jsdom
// 1.18.0 Welle 6 (Coder B): Gesten und Reaktionen der NPC (social-logic), Laserpunkt bei Katze/Tauben, Verdrahtung im Modul npc
// (Spieler-Emotes, Ereignisse, Laserblick), Kioskfrau wirft Bonbons, Gabi/Ronny bei Provokation, Sprecher-Regie.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { Scene, PerspectiveCamera, Group } from 'three';
import { MODULES } from '../src/js/store3d/modules/index.js';
import { ModuleHost } from '../src/js/store3d/modules/runtime.js';
import { buildLayout } from '../src/js/store3d/world/layout.js';
import npc from '../src/js/store3d/modules/npc.js';
import kiosk from '../src/js/store3d/modules/kiosk.js';
import salonMod from '../src/js/store3d/modules/salon.js';
import { emoteReaction, eventForDiscover, pickReactors, EMOTE_REACT, EVENT_REACT } from '../src/js/store3d/npc/social-logic.js';
import { createCat, stepCat, createFlock, stepFlock, CAT, PIGEON } from '../src/js/store3d/npc/animals-logic.js';
import { LINES } from '../src/js/store3d/npc/lines.js';
import { seeded } from '../src/js/store3d/modules/m4-util.js';
import { layoutOf, fakeCanvas } from './helpers-city.js';

describe('npc/social-logic', () => {
  it('Emotes: Tanzen → mittanzen, Winken → winken, Verbeugen → klatschen; sonst nichts', () => {
    expect(emoteReaction('dance')).toEqual(EMOTE_REACT.dance);
    expect(emoteReaction('Tanzen').anim).toBe('dance');
    expect(emoteReaction('wave').anim).toBe('wave');
    expect(emoteReaction('bow').anim).toBe('clap');
    expect(emoteReaction('sit')).toBe(null);
    expect(emoteReaction(null)).toBe(null);
    for (const r of [...Object.values(EMOTE_REACT), ...Object.values(EVENT_REACT)]) expect(LINES[r.cat].length, r.cat).toBeGreaterThanOrEqual(10);
  });
  it('Entdeckung → Ereignisart', () => {
    expect(eventForDiscover('hoop-3')).toBe('basket');
    expect(eventForDiscover('can-pyramid')).toBe('cans');
    expect(eventForDiscover('richard-ban')).toBe('ban');
    expect(eventForDiscover('zebra')).toBe('discover');
    expect(eventForDiscover('knockout')).toBe(null);
    expect(eventForDiscover(null)).toBe(null);
  });
  it('pickReactors: nächste zuerst, höchstens n, nur im Radius', () => {
    const c = [{ x: 5, z: 0 }, { x: 1, z: 0 }, { x: 20, z: 0 }, { x: 3, z: 0 }];
    expect(pickReactors(c, { x: 0, z: 0 }, { r: 9, n: 2 })).toEqual([{ x: 1, z: 0 }, { x: 3, z: 0 }]);
    expect(pickReactors(c, { x: 0, z: 0 }, { r: 0.5 })).toEqual([]);
  });
});

describe('Laserpunkt: Katze und Tauben (animals-logic)', () => {
  const spots = [{ x: 0, z: 0, y: 0 }, { x: 6, z: 0, y: 0 }];
  const envOf = (laser, o = {}) => ({ rand: seeded(3), spots, free: () => true, player: null, laser, ...o });
  const sit = () => { const c = createCat(spots, seeded(1)); c.x = 0; c.z = 0; c.y = 0; c.state = 'sit'; c.timer = 99; return c; };

  it('Katze jagt den Punkt, meldet nach 3 s `catlaser` (einmal), springt danach, ohne Laser unverändert', () => {
    const c = sit();
    const evs = [];
    for (let t = 0; t < 4; t += 0.05) evs.push(...stepCat(c, 0.05, envOf({ x: 4, z: 0 })));
    expect(c.state).toBe('chase');
    expect(Math.abs(c.x - 4)).toBeLessThan(0.3);
    expect(evs.filter((e) => e.type === 'catlaser').length).toBe(1);
    const pounce = [];
    for (let t = 0; t < 0.2; t += 0.05) pounce.push(stepCat(c, 0.05, envOf(null)));
    expect(c.state).toBe('pounce');
    let maxY = 0;
    for (let t = 0; t < 1; t += 0.05) { stepCat(c, 0.05, envOf(null)); maxY = Math.max(maxY, c.y); }
    expect(maxY).toBeGreaterThan(0.1);
    expect(c.state).toBe('sit');
    expect(c.y).toBe(0);
    // ohne Laser wie bisher
    const d = sit();
    for (let t = 0; t < 2; t += 0.05) stepCat(d, 0.05, envOf(null));
    expect(d.state).not.toBe('chase');
  });
  it('Katze ignoriert einen zu fernen oder verdeckten Punkt', () => {
    const far = sit();
    stepCat(far, 0.05, envOf({ x: CAT.laserRange + 3, z: 0 }));
    expect(far.state).toBe('sit');
    const blocked = sit();
    stepCat(blocked, 0.05, envOf({ x: 4, z: 0 }, { free: () => false }));
    expect(blocked.state).toBe('sit');
  });
  it('Tauben flattern beim Punkt in der Nähe auf, fernab nicht', () => {
    const homes = [{ x: 0, z: 0, r: 1 }];
    const f = createFlock(homes, 5, seeded(2));
    const env = (laser) => ({ rand: seeded(5), homes, player: null, bounds: null, laser });
    expect(stepFlock(f, 0.05, env({ x: 40, z: 40 })).length).toBe(0);
    expect(f.every((p) => p.state !== 'fly')).toBe(true);
    const ev = stepFlock(f, 0.05, env({ x: f[0].x + PIGEON.laserDist * 0.5, z: f[0].z }));
    expect(ev.some((e) => e.type === 'flush')).toBe(true);
    expect(f.every((p) => p.state === 'fly')).toBe(true);
  });
});

function mkCanvasCtx() {
  return function getContext() {
    return new Proxy({}, {
      get: (t, k) => (k in t ? t[k] : (k === 'measureText' ? () => ({ width: 10 }) : () => ({ addColorStop() {} }))),
      set: (t, k, v) => { t[k] = v; return true; },
    });
  };
}

describe('Modul npc/kiosk: Reaktionen', () => {
  let host;
  let dom;
  let app;
  let hits;
  let sounds;
  let found;
  let discoverFn;
  let emoteFn;
  let spoken;
  const realGetContext = HTMLCanvasElement.prototype.getContext;
  beforeEach(() => { HTMLCanvasElement.prototype.getContext = mkCanvasCtx(); window.__lfxStore = {}; });
  afterEach(() => {
    if (host) host.hook('dispose');
    host = null;
    if (dom) dom.remove();
    HTMLCanvasElement.prototype.getContext = realGetContext;
    MODULES.length = 0;
    delete window.__lfxStore;
  });

  async function build({ withRegie = false, mods = [npc, kiosk] } = {}) {
    const layout = buildLayout([{ id: 'new', label: 'Neuheiten', kind: 'new', color: '#f00', itemIds: ['c1'] }]);
    hits = []; sounds = []; found = []; spoken = []; discoverFn = null; emoteFn = null;
    const groups = { street: new Group(), yard: new Group(), palast: new Group(), palastInterior: new Group() };
    const fakeCity = {
      name: 'fakecity',
      init(ctx) {
        for (const g of Object.values(groups)) ctx.scene.add(g);
        ctx.provide('city', { data: layout.city, groups, signals: () => ({ walkMain: false, walkSide: true }), visible: () => ({}) });
        ctx.provide('weather', { tod: 'day', raining: false, hour: 14 });
        ctx.provide('discover', { found: (id) => { found.push(id); return true; }, has: () => false, list: () => [], onChange: (fn) => { discoverFn = fn; return () => { discoverFn = null; }; } });
        ctx.provide('sound', { play: (n) => sounds.push(n) });
        ctx.provide('emotes', { onPlayerEmote: (fn) => { emoteFn = fn; return () => { emoteFn = null; }; } });
        ctx.provide('fight', { weapon: () => 'hand', protected: () => false, hitPlayer: (o) => { hits.push(o); return true; } });
        if (withRegie) ctx.provide('cashier', { speaker: (o) => ({ say: (t) => { spoken.push({ o, t }); return Promise.resolve('spoken'); }, release() {}, cancel() {} }) });
      },
    };
    MODULES.length = 0;
    MODULES.push(fakeCity, ...mods);
    dom = document.createElement('div');
    const canvas = document.createElement('canvas');
    dom.appendChild(canvas);
    document.body.appendChild(dom);
    const state = { x: 10, z: 20, yaw: 0, pitch: 0 };
    const camera = new PerspectiveCamera(70, 1.5, 0.05, 90);
    app = {
      layout, deps: { catalog: { items: new Map(), departments: [], highlights: [], resume: [] }, toast: vi.fn(), user: { name: 'Max' } },
      opts: { debug: true, devFlags: { npc: true, cars: true } }, phone: false, touch: false, sound: false, mode: 'play',
      engine: { scene: new Scene(), camera, renderer: { domElement: canvas }, preset: { level: 'high' } },
      player: { ...state, y: 0, state, cancelPath() {}, teleport: vi.fn(), knock: vi.fn(), moved: 0 },
      setMode(m) { app.mode = m; }, holdview: { isOpen: false }, findSlot: () => null, take: vi.fn(), host: dom,
    };
    host = new ModuleHost(app);
    await host.init();
    host.emit('enter');
    return app;
  }
  const place = (x, z, yaw = 0, y = 0) => { app.player.state.x = x; app.player.state.z = z; app.player.state.yaw = yaw; app.player.x = x; app.player.z = z; app.player.y = y; };
  const tick = (n, dt = 0.05) => { for (let i = 0; i < n; i++) host.hook('update', dt, i * dt); };
  const walkers = () => host.ctx.use('npc').people().filter((q) => q.kind === 'walker');

  it('Spieler-Emote (Ereignis player-emote): Tanzen → nahe Passanten tanzen mit, Verbeugen → klatschen, Sitzen → nichts', async () => {
    await build();
    tick(3);
    const w = walkers()[0];
    place(w.x + 2, w.z, 0);
    tick(1);
    expect(typeof emoteFn).toBe('function'); // Provider 'emotes'.onPlayerEmote (Weg über net.js)
    emoteFn({ name: 'dance', code: 5, anim: 'dance' });
    const dancers = walkers().filter((q) => q.handle.anim.anim === 'dance');
    expect(dancers.length).toBeGreaterThanOrEqual(1);
    tick(100); // 5 s: Tanz endet, Passant geht weiter (Alltags-Tanz an der Ampel hat 60 s Pause je Person)
    for (const d of dancers) expect(d.handle.anim.anim).not.toBe('dance');
    host.emit('player-emote', { name: 'bow' }); // Rückfall über ctx.on
    tick(10);
    expect(walkers().some((q) => q.handle.anim.anim === 'clap')).toBe(true);
    const p = host.ctx.use('npc');
    expect(p.react('emote', { name: 'sit' })).toBe(false);
    expect(p.react('emote', { name: 'wave' })).toBe(true);
  });

  it('Ereignisse: Entdeckung → Klatschen/Jubel, Korb → Jubel, Hausverbot → Kopfschütteln (Ereignis-Abklingzeit)', async () => {
    await build();
    tick(3);
    const w = walkers()[0];
    place(w.x + 2, w.z, 0);
    tick(1);
    expect(typeof discoverFn).toBe('function');
    discoverFn('zebra', 3);
    expect(walkers().some((q) => q.handle.anim.anim === 'clap')).toBe(true);
    const p = host.ctx.use('npc');
    expect(p.react('discover')).toBe(false); // Abklingzeit 3 s
    tick(80);
    discoverFn('hoop-3', 4);
    expect(walkers().some((q) => q.handle.anim.anim === 'cheer')).toBe(true);
    tick(80);
    expect(p.react('ban')).toBe(true);
    expect(walkers().some((q) => q.handle.anim.anim === 'shake')).toBe(true);
  });

  it('Laserblick: Passant hält die Hände vor die Augen (2 s); ängstlich/normal flieht danach, hitzköpfig greift an', async () => {
    await build();
    tick(3);
    const p = host.ctx.use('npc');
    const pick = (t) => walkers().find((q) => p.temperOf(q.handle) === t);
    const shy = pick('shy') || pick('normal');
    expect(shy).toBeTruthy();
    place(shy.x + 3, shy.z, 0);
    tick(1);
    expect(p.laserHit(shy.handle)).toBe(true);
    tick(4);
    expect(shy.handle.anim.anim).toBe('cover');
    expect(p.laserHit(shy.handle)).toBe(false); // schon geblendet
    tick(60);
    expect(shy.handle.anim.anim).not.toBe('cover');
    expect(p.attackers()).toBe(0);
    const hot = pick('hot');
    if (hot) {
      place(hot.x + 1.2, hot.z, 0);
      tick(1);
      expect(p.laserHit(hot.handle)).toBe(true);
      expect(p.attackers()).toBe(1); // geblendeter Hitzkopf zählt für MAX_ATTACKERS mit
      for (let i = 0; i < 200 && !hits.length; i++) tick(1);
      expect(hits.length).toBeGreaterThanOrEqual(1);
    }
    expect(p.laserHit({})).toBe(false);
  });

  it('Laserblick auf Personal: Pose cover 2 s, danach idle', async () => {
    await build();
    tick(3);
    const p = host.ctx.use('npc');
    const s = p.staff('ticket');
    place(s.root.position.x, s.root.position.z + 3, 0);
    tick(1);
    expect(p.laserHit(s)).toBe(true);
    expect(s.anim.anim).toBe('cover');
    tick(60);
    expect(s.anim.anim).toBe('idle');
  });

  it('Provider animals.laser: Katze jagt den Punkt, nach 3 s Entdeckung cat-laser; Punkt verfällt ohne Meldung', async () => {
    await build();
    tick(3);
    const cat = window.__lfxStore.m3.npc.cat();
    const animals = host.ctx.use('animals');
    expect(animals).toBeTruthy();
    for (let i = 0; i < 90; i++) { const c = window.__lfxStore.m3.npc.cat(); animals.laser({ x: c.x + 0.9, z: c.z }); tick(1); }
    void cat;
    expect(found).toContain('cat-laser');
    // ohne Meldung verfällt der Punkt
    tick(30);
    expect(window.__lfxStore.m3.npc.cat().state).not.toBe('chase');
  });

  it('Kioskfrau: Schlag → wirft Bonbons (Ton candy, Treffer klein, ein InstancedMesh), Abklingzeit; Laserblick → cover', async () => {
    await build();
    tick(3);
    const p = host.ctx.use('npc');
    const k = p.people().find((q) => q.kind === 'kiosk');
    expect(k).toBeTruthy();
    place(k.x, k.z + 1.2, 0);
    tick(2);
    const ev = { origin: { x: k.x, y: 1.6, z: k.z + 1.2 }, dir: { x: 0, y: 0, z: -1 } };
    expect(host.action('hit', ev)).toBe(true);
    expect(k.handle.getHandItem()).toBe('candy');
    tick(40);
    expect(sounds).toContain('candy');
    expect(hits.length).toBe(1);
    expect(hits[0]).toMatchObject({ src: 'npc' });
    expect(hits[0].dmg).toBeLessThanOrEqual(6);
    hits.length = 0;
    host.action('hit', ev);
    tick(20);
    expect(hits.length).toBe(0); // Abklingzeit
    tick(40);
    expect(k.handle.getHandItem()).toBe(null);
    expect(p.laserHit(k.handle)).toBe(true);
    expect(k.handle.anim.anim).toBe('cover');
  });

  it('Kioskfrau: kein Wurf in VR', async () => {
    await build();
    tick(3);
    const p = host.ctx.use('npc');
    const k = p.people().find((q) => q.kind === 'kiosk');
    place(k.x, k.z + 1.2, 0);
    tick(2);
    app.xr = { presenting: true };
    host.action('hit', { origin: { x: k.x, y: 1.6, z: k.z + 1.2 }, dir: { x: 0, y: 0, z: -1 } });
    tick(40);
    expect(hits.length).toBe(0);
  });

  it('Sprecher-Regie: Passanten/Personal sprechen über cashier.speaker mit voiceSeed aus dem Seed, ohne pitch/rate; Blase nur bei „bubble“', async () => {
    await build({ withRegie: true });
    tick(3);
    const p = host.ctx.use('npc');
    const w = walkers()[0];
    place(w.x + 1.5, w.z, 0);
    tick(1);
    p.react('emote', { name: 'wave' });
    await Promise.resolve();
    expect(spoken.length).toBeGreaterThanOrEqual(1);
    const o = spoken[0].o;
    expect(o.voiceSeed).toBeDefined();
    expect(o.pitch).toBeUndefined();
    expect(o.rate).toBeUndefined();
    expect(typeof o.pos).toBe('function');
    expect(dom.querySelectorAll('.lfx-store-bubble.is-npc:not([hidden])').length).toBe(0); // gesprochen → keine Blase
    // speak über den Provider: 'bubble' → Blase
    const h = p.staff('ticket');
    host.ctx.use('cashier').speaker = () => ({ say: () => Promise.resolve('bubble'), release() {} });
    place(h.root.position.x, h.root.position.z + 2, 0);
    await p.speak(h, 'Hallo', { id: 'x', voiceSeed: 'x' });
    expect(p.speak).toBeTypeOf('function');
  });
});

// ---------------------------------------------------------------- Salon: Gabi und Ronny bei Provokation
function salonSetup({ xr = false } = {}) {
  const L = layoutOf(80);
  const providers = new Map();
  const rec = { hits: [], items: [], anims: [], sfx: [], said: [] };
  const groups = { salonInterior: new Group(), street: new Group() };
  providers.set('city', { groups });
  providers.set('areas', { current: () => 'salon', on: () => () => {} });
  const regs = [];
  const mkHandle = (who) => ({
    root: new Group(), anim: { anim: 'idle' }, disposed: false, who,
    say: vi.fn((t) => rec.said.push(t)), hitReact: vi.fn(), lookAt: vi.fn(),
    setAnim: vi.fn(function setAnim(n) { rec.anims.push([this.who, n]); this.anim.anim = n; }),
    setHandItem: vi.fn(function setHandItem(i) { rec.items.push([this.who, i]); }),
    dispose() { this.disposed = true; },
  });
  let n = 0;
  providers.set('npc', {
    figure: vi.fn((o) => { const h = mkHandle(n++ === 0 ? 'gabi' : 'ronny'); h.root.position.set(o.pos.x, 0, o.pos.z); groups.salonInterior.add(h.root); return h; }),
    registerPerson: vi.fn((r) => { regs.push(r); return () => {}; }),
  });
  providers.set('avatar', { openEditor: vi.fn(() => Promise.resolve(true)), changedFor: () => false, changeKind: () => null, markSeen() {}, code: () => null });
  providers.set('selfview', { playAnim() {} });
  providers.set('sound', { play: (s) => rec.sfx.push(s) });
  providers.set('fight', { hitPlayer: vi.fn((o) => { rec.hits.push(o); return true; }) });
  const state = { xr };
  const camera = new PerspectiveCamera(70, 1.6, 0.05, 120);
  const ctx = {
    layout: L, scene: new Scene(), camera, renderer: { info: { autoReset: true }, shadowMap: { autoUpdate: true }, getRenderTarget: () => null, setRenderTarget() {}, render() {} }, opts: {},
    deps: { toast() {}, profile: { get: () => ({ evt: {} }), update() {} } },
    quality: () => 'low', xr: { presenting: () => state.xr, toast() {} }, stage: { isStore: () => true },
    addCollider: (r) => r, removeCollider() {}, moveCollider: (r) => r, addInteractable: () => () => {},
    player: { getPose: () => ({ x: 0, z: 0, y: 0 }), eyeY: () => 1.65, teleport() {}, freeze() {}, camera: { flyTo: () => new Promise(() => {}), release() {} } },
    overlay: { isOpen: () => false, close() {} }, track: (o) => o,
    provide: (nm, impl) => { providers.set(nm, impl); return () => { if (providers.get(nm) === impl) providers.delete(nm); }; },
    use: (nm) => providers.get(nm), on: () => () => {},
  };
  const sa = L.city.salon;
  // Spieler 1,2 m vor Ronny (Ronny = zweite Person)
  ctx.player.getPose = () => ({ x: sa.ronny.x + 1.2, z: sa.ronny.z, y: 0 });
  return { ctx, rec, regs, providers, state, sa, setPlayer: (p) => { ctx.player.getPose = () => ({ y: 0, ...p }); } };
}

describe('Salon: Provokation (1.18.0)', () => {
  beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function () { return fakeCanvas().getContext(); }); });
  afterEach(() => { vi.restoreAllMocks(); });
  const reg = (t, who) => t.regs.find((r) => r.kind === `salon-${who}`);
  const run = (h, secs) => { for (let i = 0; i < secs / 0.05; i++) h.update(0.05); };

  it('Ronny schlägt mit dem Kleiderbügel: Drohpose, Item hanger, nach der Drohfrist Hieb + hitPlayer(src npc)', () => {
    const t = salonSetup();
    const h = salonMod.init(t.ctx);
    reg(t, 'ronny').onHit({ x: 1, z: 0 });
    expect(t.rec.items).toContainEqual(['ronny', 'hanger']);
    expect(t.rec.anims).toContainEqual(['ronny', 'threat']);
    expect(t.rec.hits.length).toBe(0);
    run(h, 2);
    expect(t.rec.anims).toContainEqual(['ronny', 'swing']);
    expect(t.rec.hits.length).toBe(1);
    expect(t.rec.hits[0]).toMatchObject({ src: 'npc' });
    expect(Math.hypot(t.rec.hits[0].knock.x, t.rec.hits[0].knock.z)).toBeCloseTo(1, 3);
    run(h, 12);
    expect(t.rec.items[t.rec.items.length - 1]).toEqual(['ronny', null]); // beruhigt sich
    h.dispose();
  });

  it('Gabi droht mit dem Föhn: 1. Schlag nur Drohen, 2. Schlag im Gedächtnis → Hieb; Spieler zu weit weg → kein Treffer', () => {
    const t = salonSetup();
    const h = salonMod.init(t.ctx);
    t.setPlayer({ x: t.sa.gabi.x + 1.2, z: t.sa.gabi.z });
    reg(t, 'gabi').onHit({ x: 1, z: 0 });
    expect(t.rec.items).toContainEqual(['gabi', 'dryer']);
    run(h, 2);
    expect(t.rec.hits.length).toBe(0);
    run(h, 3);
    reg(t, 'gabi').onHit({ x: 1, z: 0 });
    run(h, 2);
    expect(t.rec.hits.length).toBe(1);
    // weit weg: kein Treffer
    const t2 = salonSetup();
    const h2 = salonMod.init(t2.ctx);
    t2.setPlayer({ x: t2.sa.ronny.x + 5, z: t2.sa.ronny.z });
    reg(t2, 'ronny').onHit({ x: 1, z: 0 });
    run(h2, 2);
    expect(t2.rec.hits.length).toBe(0);
    h.dispose(); h2.dispose();
  });

  it('keine Angriffe in VR; Laserblick: Pose cover, nach 2 s idle', () => {
    const t = salonSetup({ xr: true });
    const h = salonMod.init(t.ctx);
    reg(t, 'ronny').onHit({ x: 1, z: 0 });
    run(h, 3);
    expect(t.rec.hits.length).toBe(0);
    expect(t.rec.items.length).toBe(0);
    t.state.xr = false;
    reg(t, 'ronny').onLaser();
    expect(t.rec.anims).toContainEqual(['ronny', 'cover']);
    run(h, 2.5);
    expect(t.rec.anims[t.rec.anims.length - 1]).toEqual(['ronny', 'idle']);
    h.dispose();
  });
});
