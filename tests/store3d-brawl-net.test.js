// @vitest-environment jsdom
// Mehrspieler (Welle c, C2) im echten Modul brawl und daytime: Rollen local/owner/mirror, Spiegel ohne Wirkung auf den lokalen Spieler,
// Hausverbot nur beim Täter, Treffer-Anspruch über den Haken, Regen-Override. Kein Netzwerk.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { Scene, PerspectiveCamera, Vector3 } from 'three';
import { MODULES } from '../src/js/store3d/modules/index.js';
import { ModuleHost } from '../src/js/store3d/modules/runtime.js';
import { buildLayout } from '../src/js/store3d/world/layout.js';
import cashier from '../src/js/store3d/modules/cashier.js';
import brawl from '../src/js/store3d/modules/brawl.js';
import daytime from '../src/js/store3d/modules/daytime.js';
import { STATES, BRAWL } from '../src/js/store3d/modules/brawl-fsm.js';

function mkCanvasCtx() {
  return function getContext() {
    return new Proxy({}, {
      get: (t, k) => (k in t ? t[k] : (k === 'measureText' ? () => ({ width: 10 }) : () => ({ addColorStop() {} }))),
      set: (t, k, v) => { t[k] = v; return true; },
    });
  };
}

const net = (s, o = {}) => ({ v: 1, f: { v: 1, s: STATES.indexOf(s), h: o.h ?? 3, r: o.r ?? 0 }, x: o.x ?? 4, z: o.z ?? 14, y: 0, yaw: 0, a: o.a ?? 0 });

describe('brawl: Mehrspieler-Rollen', () => {
  let host;
  let dom;
  const realGetContext = HTMLCanvasElement.prototype.getContext;
  beforeEach(() => {
    MODULES.length = 0;
    MODULES.push(cashier, brawl);
    HTMLCanvasElement.prototype.getContext = mkCanvasCtx();
    try { sessionStorage.clear(); } catch { /* egal */ }
  });
  afterEach(() => {
    if (host) host.hook('dispose');
    host = null;
    if (dom) dom.remove();
    HTMLCanvasElement.prototype.getContext = realGetContext;
    MODULES.length = 0;
    delete window.__lfxM4;
    delete window.__lfxBrawl;
  });

  async function build() {
    const items = new Map([['c1', { Id: 'c1', Name: 'Titel', Genres: [], Type: 'Movie', lfx: { media: 'vhs' } }]]);
    const layout = buildLayout([{ id: 'new', label: 'Neuheiten', kind: 'new', color: '#f00', itemIds: ['c1'] }]);
    dom = document.createElement('div');
    const canvas = document.createElement('canvas');
    dom.appendChild(canvas);
    const state = { x: layout.w - 2.9, z: layout.d - 4.1, yaw: 0, pitch: 0 };
    const knock = vi.fn();
    const door = { lock: vi.fn(), unlock: vi.fn(), isLocked: () => false, onChange() {}, registerActor() {}, override() {}, open() {}, amount: () => 0 };
    const app = {
      layout,
      deps: { catalog: { items, departments: [], highlights: [], resume: [] }, toast: vi.fn(), user: { name: 'Max' } },
      opts: { debug: true }, phone: false, touch: false, sound: false, mode: 'play',
      engine: { scene: new Scene(), camera: new PerspectiveCamera(), renderer: { domElement: canvas }, preset: { level: 'mid' } },
      player: { ...state, state, y: 0, cancelPath() {}, teleport: vi.fn(), knock, eyeY: () => 1.65, turnTo: null, moved: 0 },
      getCarried: () => null,
      setMode(m) { app.mode = m; }, holdview: { isOpen: false }, findSlot: () => null, take: vi.fn(), host: dom,
    };
    document.body.appendChild(dom);
    host = new ModuleHost(app);
    host.providers.set('door', door);
    await host.init();
    return { app, state, knock, door, layout, bw: host.providers.get('brawl') };
  }
  const hitEv = (layout) => ({ name: 'hit', source: 'key', aim: null, origin: new Vector3(layout.w - 2.9, 1.65, layout.d - 3.7), dir: new Vector3(0, -0.2, 1).normalize() });
  const tick = (t0, n, dt = 0.1) => { let t = t0; for (let i = 0; i < n; i++) { t += dt; host.hook('update', dt, t); } return t; };

  it('Standard ist local; ohne Haken verhält sich ein Treffer wie 1.15', async () => {
    const { bw, layout } = await build();
    expect(bw.netRole()).toBe('local');
    host.hook('update', 0.016, 1);
    expect(host.action('hit', hitEv(layout))).toBe(true);
    expect(bw.state()).toBe('annoyed');
    expect(bw.netRole()).toBe('local');
  });

  it('Treffer außerhalb der Autorität ruft claim() und macht mich zum Inhaber; ein verweigerter Anspruch bleibt lokal', async () => {
    const { bw, layout } = await build();
    const claim = vi.fn(() => true);
    bw.setNet({ claim, aim: () => null });
    host.hook('update', 0.016, 1);
    host.action('hit', hitEv(layout));
    expect(claim).toHaveBeenCalledTimes(1);
    expect(bw.netRole()).toBe('owner');
    host.hook('update', 0.016, 2);
    host.action('hit', hitEv(layout)); // als Inhaber kein weiterer Anspruch
    expect(claim).toHaveBeenCalledTimes(1);
    expect(bw.state()).toBe('shove');
  });

  it('Spiegel: Zustand und Ort kommen von außen, die lokale FSM läuft nicht, nichts trifft den lokalen Spieler', async () => {
    const { bw, knock, door, app } = await build();
    expect(bw.setNetRole('mirror', { self: false })).toBe(true);
    expect(bw.applyRemote(net('chase', { r: 40, x: 4, z: 12 }), { self: false })).toBe(true);
    expect(bw.state()).toBe('chase');
    // weit über CHASE_GIVEUP und CHASE_MAX hinaus: kein Rauswurf, kein Zeitablauf, kein Schubsen, kein Teleport, keine Tür
    tick(1, 700);
    expect(bw.state()).toBe('chase');
    expect(knock).not.toHaveBeenCalled();
    expect(app.player.teleport).not.toHaveBeenCalled();
    expect(door.lock).not.toHaveBeenCalled();
    expect(dom.querySelector('.lfx-store-expelveil').style.opacity).toBe('0');
    expect(sessionStorage.length).toBe(0);
  });

  it('Spiegel: k = 1 zeigt Augen zuhalten (cover) mit Laser-Satz, ohne k Taumeln mit Schlag-Satz', async () => {
    const { LINES } = await import('../src/js/store3d/modules/cashier-lines.js');
    const a = await build();
    a.bw.setNetRole('mirror', { self: false });
    host.hook('update', 0.016, 1);
    a.bw.applyRemote({ ...net('annoyed', { a: 1 }), k: 1 }, { self: false });
    const txt = dom.querySelector('.lfx-store-bubble').textContent;
    expect(LINES.laserHit.some((l) => txt.includes(l.replace('{name}', 'Max')))).toBe(true);
    host.hook('dispose'); dom.remove();

    const b = await build();
    b.bw.setNetRole('mirror', { self: false });
    host.hook('update', 0.016, 1);
    b.bw.applyRemote(net('annoyed', { a: 1 }), { self: false });
    const txt2 = dom.querySelector('.lfx-store-bubble').textContent;
    expect(LINES.laserHit.some((l) => txt2.includes(l.replace('{name}', 'Max')))).toBe(false);
    expect(LINES.hit1.some((l) => txt2.includes(l.replace('{name}', 'Max')))).toBe(true);
  });

  it('Spiegel: Hausverbot, Tür und HUD nur beim Täter (self)', async () => {
    const a = await build();
    a.bw.setNetRole('mirror', { self: false });
    a.bw.applyRemote(net('banned', { r: 25 }), { self: false });
    a.state.z = a.layout.d + 3; // draußen
    tick(1, 5);
    expect(a.bw.state()).toBe('banned');
    expect(a.door.lock).not.toHaveBeenCalled();
    expect(dom.querySelector('.lfx-store-banhud').hidden).toBe(true);
    host.hook('dispose'); dom.remove();

    const b = await build();
    b.bw.setNetRole('mirror', { self: true });
    b.bw.applyRemote(net('banned', { r: 25 }), { self: true });
    b.state.z = b.layout.d + 3;
    tick(1, 5);
    expect(b.door.lock).toHaveBeenCalled();
    expect(dom.querySelector('.lfx-store-banhud').hidden).toBe(false);
    expect(dom.querySelector('.lfx-store-banhud').textContent).toMatch(/HAUSVERBOT/);
  });

  it('Spiegel: Treffer im fremden Streit zählt nicht und sendet keinen Anspruch; im friedlichen Spiegel (annoyed) übernimmt er', async () => {
    const { bw, layout } = await build();
    const claim = vi.fn(() => true);
    bw.setNet({ claim, aim: () => null });
    const home = bw.getNetState(); // Richard steht am Tresen: Treffer müssen ihn weiter erreichen
    bw.setNetRole('mirror', { self: false });
    bw.applyRemote(net('shove', { r: 20, h: 2, x: home.x, z: home.z }));
    host.hook('update', 0.016, 1);
    host.action('hit', hitEv(layout));
    expect(claim).not.toHaveBeenCalled();
    expect(bw.state()).toBe('shove');
    expect(bw.netRole()).toBe('mirror');

    bw.applyRemote(net('annoyed', { r: 20, h: 1, x: home.x, z: home.z }));
    host.hook('update', 0.016, 3);
    host.action('hit', hitEv(layout));
    expect(claim).toHaveBeenCalledTimes(1);
    expect(bw.netRole()).toBe('owner');
    expect(bw.state()).toBe('shove'); // der gespiegelte Stand wird fortgesetzt: annoyed -> shove
  });

  it('Spiegel: calm/grudge auf der Leitung gibt Richard an die lokale Logik zurück; eigene spitze Phase bleibt erhalten', async () => {
    const { bw } = await build();
    window.__lfxBrawl.force('grudge');
    expect(bw.state()).toBe('grudge');
    bw.setNetRole('mirror');
    bw.applyRemote(net('throw', { r: 9 }));
    expect(bw.state()).toBe('throw');
    bw.applyRemote(net('calm'));
    expect(bw.netRole()).toBe('local');
    expect(bw.state()).toBe('grudge'); // vor dem Spiegeln gemerkt (W14: Grudge lokal)
    const { bw: bw2 } = await (async () => { host.hook('dispose'); dom.remove(); return build(); })();
    bw2.setNetRole('mirror');
    bw2.applyRemote(net('chase', { r: 40 }));
    bw2.setNetRole('local');
    expect(bw2.state()).toBe('calm');
  });

  it('Spiegel glättet den Ort und wirft nur optisch (Kassette zum Ziel, kein Körper, kein Treffer)', async () => {
    const { bw, app, knock } = await build();
    const aim = vi.fn(() => ({ x: 6, y: 0, z: 14 }));
    bw.setNet({ claim: () => false, aim });
    bw.setNetRole('mirror');
    const before = app.engine.scene.children.length;
    bw.applyRemote(net('throw', { r: 8, a: 5 }));
    expect(aim).toHaveBeenCalled();
    expect(app.engine.scene.children.length).toBe(before + 1); // genau eine Kassette
    // sie fliegt und verschwindet wieder; der lokale Spieler wird nie getroffen
    app.player.state.x = 6; app.player.state.z = 14;
    tick(1, 60, 0.1);
    expect(knock).not.toHaveBeenCalled();
    expect(app.engine.scene.children.length).toBe(before);
  });

  it('1.15 unverändert: applyRemote ohne Spiegel ist hart, getNetState rundet', async () => {
    const { bw } = await build();
    expect(bw.applyRemote(net('annoyed', { r: 10 }))).toBe(true);
    expect(bw.state()).toBe('annoyed');
    expect(bw.getNetState().f.r).toBeGreaterThan(0);
    expect(bw.getNetState().f.s).toBe(STATES.indexOf('annoyed'));
    expect(BRAWL.DECAY).toBe(25);
  });
});

describe('daytime: setRaining', () => {
  let host;
  let dom;
  const realGetContext = HTMLCanvasElement.prototype.getContext;
  beforeEach(() => { MODULES.length = 0; MODULES.push(daytime); HTMLCanvasElement.prototype.getContext = mkCanvasCtx(); });
  afterEach(() => {
    if (host) host.hook('dispose');
    host = null;
    if (dom) dom.remove();
    HTMLCanvasElement.prototype.getContext = realGetContext;
    MODULES.length = 0;
    delete window.__lfxM4;
  });

  async function build(opts = {}) {
    const layout = buildLayout([{ id: 'new', label: 'Neuheiten', kind: 'new', color: '#f00', itemIds: [] }]);
    dom = document.createElement('div');
    const canvas = document.createElement('canvas');
    dom.appendChild(canvas);
    const app = {
      layout, deps: {}, opts: { debug: true, ...opts }, phone: false, touch: false, sound: false, mode: 'play',
      engine: { scene: new Scene(), camera: new PerspectiveCamera(), renderer: { domElement: canvas, toneMappingExposure: 1 }, preset: { level: 'mid' } },
      player: { x: 5, z: 5, y: 0, state: { x: 5, z: 5 }, eyeY: () => 1.65 },
      getCarried: () => null, setMode() {}, holdview: { isOpen: false }, findSlot: () => null, take() {}, host: dom,
    };
    document.body.appendChild(dom);
    host = new ModuleHost(app);
    await host.init();
    return host.providers.get('weather');
  }

  it('setRaining(true|false) überschreibt, null stellt die lokale Entscheidung wieder her', async () => {
    const w = await build();
    const local = w.raining;
    w.setRaining(!local);
    expect(w.raining).toBe(!local);
    w.setRaining(local);
    expect(w.raining).toBe(local);
    w.setRaining(!local);
    w.setRaining(null);
    expect(w.raining).toBe(local);
    host.hook('update', 0.016, 1); // Anwenden ohne Fehler
  });

  it('der Debug-Wert rain hat Vorrang', async () => {
    const w = await build({ rain: false });
    expect(w.raining).toBe(false);
    w.setRaining(true);
    expect(w.raining).toBe(false);
  });
});
