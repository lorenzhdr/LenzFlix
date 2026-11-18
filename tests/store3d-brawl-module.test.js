// @vitest-environment jsdom
// Module brawl + rent + cashier: Begrüßung nur im Laden, Schlag-Eskalation bis Hausverbot, Ausleihen, Diebstahlsicherung.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { Scene, PerspectiveCamera, Vector3 } from 'three';
import { MODULES } from '../src/js/store3d/modules/index.js';
import { ModuleHost } from '../src/js/store3d/modules/runtime.js';
import { buildLayout } from '../src/js/store3d/world/layout.js';
import cashier from '../src/js/store3d/modules/cashier.js';
import brawl from '../src/js/store3d/modules/brawl.js';
import rent from '../src/js/store3d/modules/rent.js';

function mkCanvasCtx() {
  return function getContext() {
    return new Proxy({}, {
      get: (t, k) => (k in t ? t[k] : (k === 'measureText' ? () => ({ width: 10 }) : () => ({ addColorStop() {} }))),
      set: (t, k, v) => { t[k] = v; return true; },
    });
  };
}

describe('Richard wehrt sich', () => {
  let host;
  let dom;
  const realGetContext = HTMLCanvasElement.prototype.getContext;
  beforeEach(() => {
    MODULES.length = 0;
    MODULES.push(cashier, brawl, rent);
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
    delete window.__lfxRent;
  });

  async function build({ outside = false, carried = null } = {}) {
    const items = new Map([['c1', { Id: 'c1', Name: 'Titel', Genres: [], Type: 'Movie', lfx: { media: 'vhs' } }]]);
    const layout = buildLayout([{ id: 'new', label: 'Neuheiten', kind: 'new', color: '#f00', itemIds: ['c1'] }]);
    dom = document.createElement('div');
    const canvas = document.createElement('canvas');
    dom.appendChild(canvas);
    const state = outside ? { x: layout.w / 2, z: layout.d + 3, yaw: 0, pitch: 0 } : { x: layout.w - 2.9, z: layout.d - 4.1, yaw: 0, pitch: 0 };
    const knock = vi.fn();
    const door = { lock: vi.fn(), unlock: vi.fn(), isLocked: () => false, onChange() {}, registerActor() {}, override() {}, open() {}, amount: () => 0 };
    const app = {
      layout,
      deps: { catalog: { items, departments: [], highlights: [], resume: [] }, toast: vi.fn(), user: { name: 'Max' } },
      opts: { debug: true }, phone: false, touch: false, sound: false, mode: 'play',
      engine: { scene: new Scene(), camera: new PerspectiveCamera(), renderer: { domElement: canvas }, preset: { level: 'mid' } },
      player: { ...state, state, y: 0, cancelPath() {}, teleport: vi.fn(), knock, eyeY: () => 1.65, turnTo: null, moved: 0 },
      getCarried: () => carried,
      setMode(m) { app.mode = m; }, holdview: { isOpen: false }, findSlot: () => null, take: vi.fn(), host: dom,
    };
    document.body.appendChild(dom);
    host = new ModuleHost(app);
    host.providers.set('door', door);
    await host.init();
    return { app, state, knock, door, layout };
  }

  // Schlagereignis: Spieler steht vor dem Tresen und schaut zu Richard
  function hitEv(layout) {
    const origin = new Vector3(layout.w - 2.9, 1.65, layout.d - 3.7);
    const dir = new Vector3(0, -0.2, 1).normalize();
    return { name: 'hit', source: 'key', aim: null, origin, dir };
  }

  it('Start draußen: keine Begrüßung, erst beim Betreten', async () => {
    const { state, layout } = await build({ outside: true });
    const bubble = dom.querySelector('.lfx-store-bubble');
    host.emit('enter');
    host.hook('update', 1.5, 1.5);
    host.hook('update', 1.5, 3);
    expect(bubble.hidden).toBe(true);
    state.x = layout.w - 5; state.z = layout.d - 5;
    host.emit('return');
    host.hook('update', 1.5, 4.5);
    expect(bubble.hidden).toBe(false);
  });

  it('Eskalation: Treffer 1 taumelt, 2 schubst (knock), 3 wirft, Provider-Zustand folgt', async () => {
    const { layout, knock } = await build();
    const bw = host.providers.get('brawl');
    expect(bw.state()).toBe('calm');
    let t = 1;
    host.hook('update', 0.016, t);
    expect(host.action('hit', hitEv(layout))).toBe(true);
    expect(bw.state()).toBe('annoyed');
    for (let i = 0; i < 20; i++) { t += 0.1; host.hook('update', 0.1, t); }
    expect(host.action('hit', hitEv(layout))).toBe(true);
    expect(bw.state()).toBe('shove');
    for (let i = 0; i < 20; i++) { t += 0.1; host.hook('update', 0.1, t); }
    expect(knock).toHaveBeenCalled();
    expect(host.action('hit', hitEv(layout))).toBe(true);
    expect(bw.state()).toBe('throw');
    expect(bw.canTalk()).toBe(false);
  });

  it('Schlag ins Leere (weggedreht) wird nicht verbraucht', async () => {
    const { layout } = await build();
    const ev = hitEv(layout);
    ev.dir.set(0, 0, -1);
    expect(host.action('hit', ev)).toBe(false);
    expect(host.providers.get('brawl').state()).toBe('calm');
  });

  it('1.18.0 Peitsche: Reichweite aus ev.range (3 m weg: Hand verfehlt, Peitsche trifft) mit Peitschen-Spruch', async () => {
    const { layout } = await build();
    const bw = host.providers.get('brawl');
    const far = (o) => { const e = hitEv(layout); e.origin.z -= 1.5; e.dir.set(0, -0.1, 1).normalize(); return { ...e, ...o }; };
    host.hook('update', 0.016, 1);
    expect(host.action('hit', far({ weapon: 'hand', range: 1.6, max: 1 }))).toBe(false);
    expect(bw.state()).toBe('calm');
    expect(host.action('hit', far({ weapon: 'whip', range: 3.5, max: 2 }))).toBe(true);
    expect(bw.state()).toBe('annoyed');
    const text = dom.querySelector('.lfx-store-bubble').textContent;
    const { LINES } = await import('../src/js/store3d/modules/cashier-lines.js');
    expect(LINES.whipHit.some((l) => text.includes(l.replace('{name}', 'Max')))).toBe(true);
  });

  it('1.18.0 Laser zählt wie ein Schlag (Zähler, Augen zuhalten, Laser-Spruch), in banned/chase gleiche Regeln', async () => {
    await build();
    const bw = host.providers.get('brawl');
    let t = 1;
    host.hook('update', 0.016, t);
    bw.hitBy('laser', { x: 0, z: 1 });
    expect(bw.state()).toBe('annoyed');
    expect(bw.getNetState().a).toBe(1); // 'cover' ist nur lokal, auf der Leitung 'stagger' (Worker begrenzt rs.a auf 0..9)
    const { LINES } = await import('../src/js/store3d/modules/cashier-lines.js');
    const bt = dom.querySelector('.lfx-store-bubble').textContent;
    expect(LINES.laserHit.some((l) => bt.includes(l.replace('{name}', 'Max')))).toBe(true);
    for (let i = 0; i < 20; i++) { t += 0.1; host.hook('update', 0.1, t); }
    bw.hitBy('laser', { x: 0, z: 1 });
    expect(bw.state()).toBe('shove');
    window.__lfxBrawl.force('chase');
    bw.hitBy('laser', null); // im Verfolgen: nicht angenommen, kein Absturz
    expect(bw.state()).toBe('chase');
  });

  it('Objekt-Treffer zählt, Hausverbot sperrt die Tür und Netzzustand rundet', async () => {
    const { door, state, layout } = await build();
    const bw = host.providers.get('brawl');
    let t = 1;
    host.hook('update', 0.016, t);
    bw.hitBy('object', { x: 0, z: 1 });
    expect(bw.state()).toBe('annoyed');
    window.__lfxBrawl.force('chase');
    expect(bw.state()).toBe('chase');
    // Spieler wird rausgeworfen
    state.z = layout.d + 2;
    t += 0.5; host.hook('update', 0.1, t);
    expect(bw.state()).toBe('banned');
    expect(bw.isBanned()).toBe(true);
    expect(door.lock).toHaveBeenCalled();
    const net = bw.getNetState();
    expect(net.f.s).toBe(5);
    expect(dom.querySelector('.lfx-store-banhud').hidden).toBe(false);
    expect(bw.applyRemote(net)).toBe(true);
  });

  it('Ausleihen: tryRent merkt die Hülle, zweites Mal meldet bereits ausgeliehen', async () => {
    await build({ carried: { id: 'c1', item: { Name: 'Titel' } } });
    const r = host.providers.get('rent');
    expect(r.isRented('c1')).toBe(false);
    expect(r.tryRent()).toBe(true);
    expect(r.isRented('c1')).toBe(true);
    expect(r.tryRent()).toBe(false);
  });

  it('Diebstahl: nicht ausgeliehene Hülle durch die Tür löst Alarm aus, ausgeliehene nicht', async () => {
    const { state, layout } = await build({ carried: { id: 'c1', item: { Name: 'Titel' } } });
    const play = vi.fn();
    const react = vi.fn();
    host.providers.set('sound', { play });
    host.providers.set('npc', { react });
    state.x = layout.w / 2; state.z = layout.d - 1.5;
    host.hook('update', 0.016, 1);
    state.z = layout.d + 0.5;
    host.hook('update', 0.016, 2);
    expect(play).toHaveBeenCalledWith('alarm');
    expect(react).toHaveBeenCalledTimes(1); // nahe Passanten schütteln den Kopf
    expect(react).toHaveBeenCalledWith('alarm', { x: layout.w / 2, z: layout.d + 0.5 });
    play.mockClear();
    state.z = layout.d - 1.5; host.hook('update', 0.016, 3);
    state.z = layout.d + 0.5; host.hook('update', 0.016, 4); // Minute noch nicht um
    expect(play).not.toHaveBeenCalledWith('alarm');
    host.providers.get('rent').rent('c1');
    state.z = layout.d - 1.5; host.hook('update', 0.016, 100);
    state.z = layout.d + 0.5; host.hook('update', 0.016, 101);
    expect(play).not.toHaveBeenCalledWith('alarm');
  });
});
