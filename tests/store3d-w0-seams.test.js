// @vitest-environment jsdom
// 1.17.0 Welle 0: Nähte für die Figur (npc.reserve/overflow, actionEvent, aimRay, noClick, Boot-Gate, Pause-Einträge, setRig, Stub-Provider).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { PerspectiveCamera, Vector3, Scene, Group } from 'three';
import { MODULES } from '../src/js/store3d/modules/index.js';
import { ModuleHost } from '../src/js/store3d/modules/runtime.js';
import { StoreApp } from '../src/js/store3d/store.js';
import { Player } from '../src/js/store3d/controls/player.js';
import { buildLayout } from '../src/js/store3d/world/layout.js';
import { createPause } from '../src/js/store3d/ui/pause.js';
import npc from '../src/js/store3d/modules/npc.js';

const realGetContext = HTMLCanvasElement.prototype.getContext;
const ALL = [...MODULES];
afterEach(() => { MODULES.length = 0; MODULES.push(...ALL); HTMLCanvasElement.prototype.getContext = realGetContext; });

// ---------------------------------------------------------------- npc.reserve / overflow
describe('npc: reserve je Schlüssel, overflow', () => {
  async function build() {
    HTMLCanvasElement.prototype.getContext = function getContext() {
      return new Proxy({}, {
        get: (t, k) => (k in t ? t[k] : (k === 'measureText' ? () => ({ width: 10 }) : () => ({ addColorStop() {} }))),
        set: (t, k, v) => { t[k] = v; return true; },
      });
    };
    const layout = buildLayout([{ id: 'new', label: 'Neuheiten', kind: 'new', color: '#f00', itemIds: ['c1'] }]);
    const groups = { street: new Group(), yard: new Group(), palast: new Group(), palastInterior: new Group() };
    const fakeCity = {
      name: 'fakecity',
      init(ctx) {
        for (const g of Object.values(groups)) ctx.scene.add(g);
        ctx.provide('city', { data: layout.city, groups, signals: () => ({ main: 'green', side: 'red', walkMain: false, walkSide: true }), visible: () => ({}) });
        ctx.provide('weather', { tod: 'day', raining: false, hour: 14 });
      },
    };
    MODULES.length = 0;
    MODULES.push(fakeCity, npc);
    const dom = document.createElement('div');
    const canvas = document.createElement('canvas');
    dom.appendChild(canvas);
    document.body.appendChild(dom);
    const state = { x: 10, z: 20, yaw: 0, pitch: 0 };
    const app = {
      layout, deps: { catalog: { items: new Map(), departments: [], highlights: [], resume: [] }, toast: vi.fn(), user: { name: 'Max' } },
      opts: { debug: true, devFlags: { npc: true, cars: true } }, phone: false, touch: false, sound: false, mode: 'play',
      engine: { scene: new Scene(), camera: new PerspectiveCamera(70, 1.5, 0.05, 90), renderer: { domElement: canvas }, preset: { level: 'low' } },
      player: { ...state, y: 0, state, cancelPath() {}, teleport: vi.fn(), knock: vi.fn(), moved: 0 },
      setMode() {}, holdview: { isOpen: false }, findSlot: () => null, take: vi.fn(), host: dom,
    };
    const host = new ModuleHost(app);
    await host.init();
    return { host, dom };
  }

  it('Werte je Schlüssel addieren sich, n <= 0 löscht den Schlüssel, Rückgabe = Wert des Schlüssels', async () => {
    const { host, dom } = await build();
    const p = host.ctx.use('npc');
    const count = () => p.people().filter((q) => q.kind === 'walker').length;
    const base = count();
    expect(base).toBeGreaterThan(3);
    expect(p.reserve(2)).toBe(2); // Standard-Schlüssel 'net'
    expect(p.reserve(1, 'avatar')).toBe(1);
    expect(count()).toBe(base - 3);
    expect(p.reserve(0, 'avatar')).toBe(0);
    expect(count()).toBe(base - 2);
    expect(p.reserve(0)).toBe(0);
    expect(count()).toBe(base);
    host.hook('dispose');
    dom.remove();
  });

  it('overflow() = max(0, Summe − Passanten-Höchstzahl)', async () => {
    const { host, dom } = await build();
    const p = host.ctx.use('npc');
    const base = p.people().filter((q) => q.kind === 'walker').length; // Höchstzahl (nichts reserviert)
    expect(p.overflow()).toBe(0);
    p.reserve(base, 'net');
    expect(p.overflow()).toBe(0);
    p.reserve(3, 'avatar');
    expect(p.overflow()).toBe(3);
    expect(p.people().filter((q) => q.kind === 'walker').length).toBe(0);
    p.reserve(0, 'net');
    expect(p.overflow()).toBe(0);
    p.reserve(0, 'avatar');
    host.hook('dispose');
    dom.remove();
  });
});

// ---------------------------------------------------------------- StoreApp-Nähte (ohne Konstruktor)
function appStub(extra = {}, provs = {}) {
  const mods = { locked: false, interactables: [], action: vi.fn(() => false), emit: vi.fn(), ctx: { use: (n) => provs[n] } };
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

describe('StoreApp: actionEvent und aimRay', () => {
  it('actionEvent trägt weapon/range/max; Ego-Ursprung = Kamera', () => {
    const { app } = appStub();
    app.engine.camera.position.set(1, 2, 3);
    const ev = app.actionEvent('hit', 'key');
    expect(ev).toMatchObject({ name: 'hit', source: 'key', weapon: 'hand', range: 1.6, max: 1 });
    expect(ev.origin.toArray()).toEqual([1, 2, 3]);
  });
  it('Außenansicht: origin = selfview.eye, Zielstrahl = Projektion des Auges auf den Kamerastrahl', () => {
    const sv = { mode: () => 'third', eye: (out) => out.set(0, 0, -4) };
    const { app } = appStub({}, { selfview: sv });
    app.engine.camera.position.set(0, 0, 0); // blickt nach -z
    app.engine.camera.updateMatrixWorld(true);
    expect(app.actionEvent('hit', 'key').origin.toArray()).toEqual([0, 0, -4]);
    const o = new Vector3(); const d = new Vector3();
    app.aimRay(o, d);
    expect(o.z).toBeCloseTo(-4);
    expect(d.z).toBeCloseTo(-1);
    // abseits des Strahls: nur der Anteil entlang der Blickrichtung zählt
    sv.eye = (out) => out.set(3, 0, -2);
    app.aimRay(o, d);
    expect(o.toArray().map((v) => Math.round(v * 1000) / 1000)).toEqual([0, 0, -2]);
  });
  it('Ego bleibt bitgleich: Kamera, Blickrichtung bzw. übergebener Strahl', () => {
    const { app } = appStub({}, { selfview: { mode: () => 'ego', eye: () => { throw new Error('nicht aufrufen'); } } });
    app.engine.camera.position.set(1, 2, 3);
    const o = new Vector3(); const d = new Vector3();
    app.aimRay(o, d);
    expect(o.toArray()).toEqual([1, 2, 3]);
    app.aimRay(o, d, { origin: new Vector3(4, 5, 6), direction: new Vector3(0, 1, 0) });
    expect(o.toArray()).toEqual([4, 5, 6]);
    expect(d.toArray()).toEqual([0, 1, 0]);
  });
});

describe('StoreApp: noClick', () => {
  it('Klick überspringt die Interaktion und schlägt, E löst onUse aus', () => {
    const ia = { onUse: vi.fn(), anyHeight: false, noClick: true };
    const { app, mods } = appStub({ aim: { ia } });
    expect(app.doUse('click')).toBe(false); // use-Handler: false, danach doHit('click') → mods.action('hit') = false
    expect(ia.onUse).not.toHaveBeenCalled();
    expect(mods.action.mock.calls.map((c) => c[0])).toEqual(['use', 'hit']);
    mods.action.mockClear();
    expect(app.doUse('key')).toBe(true);
    expect(ia.onUse).toHaveBeenCalledTimes(1);
    expect(mods.action).not.toHaveBeenCalled();
    expect(app.doUse('touch')).toBe(true);
    expect(ia.onUse).toHaveBeenCalledTimes(2);
  });
  it('ohne noClick löst auch der Klick aus (wie bisher)', () => {
    const ia = { onUse: vi.fn(), anyHeight: false };
    const { app } = appStub({ aim: { ia } });
    expect(app.doUse('click')).toBe(true);
    expect(ia.onUse).toHaveBeenCalledTimes(1);
  });
});

describe('StoreApp: Boot-Reihenfolge Gate → Intro → enter', () => {
  function seq({ skipIntro, needsGate = true, ready = true } = {}) {
    const log = [];
    const provs = {
      intro: { run: vi.fn(async () => { log.push('intro'); }) },
      avatar: { needsGate: () => needsGate, gate: vi.fn(async () => { await Promise.resolve(); log.push('gate'); }) },
    };
    const { app, mods } = appStub({ opts: { skipIntro }, ready, suspended: false }, provs);
    mods.emit = vi.fn((n) => log.push(n));
    return { app, log, provs };
  }
  it('gate vor intro vor enter', async () => {
    const { app, log } = seq({ skipIntro: false });
    await app.startSequence(null);
    expect(log).toEqual(['gate', 'intro', 'enter']);
  });
  it('auch bei skipIntro läuft das Gate, das Intro nicht', async () => {
    const { app, log, provs } = seq({ skipIntro: true });
    await app.startSequence(null);
    expect(log).toEqual(['gate', 'enter']);
    expect(provs.intro.run).not.toHaveBeenCalled();
  });
  it('ohne Gate-Bedarf kein gate(); erstes Bild wird immer abgewartet', async () => {
    const { app, log, provs } = seq({ skipIntro: true, needsGate: false, ready: false });
    const p = app.startSequence(null);
    await Promise.resolve();
    expect(log).toEqual([]); // wartet auf das erste Bild
    app.onReadyHook();
    await p;
    expect(provs.avatar.gate).not.toHaveBeenCalled();
    expect(log).toEqual(['enter']);
  });
  it('Gate-Fehler stoppt nicht; disposed nach dem Gate bricht ab', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const a = seq({ skipIntro: false });
    a.provs.avatar.gate = vi.fn(async () => { throw new Error('x'); });
    await a.app.startSequence(null);
    expect(a.log).toEqual(['intro', 'enter']);
    const b = seq({ skipIntro: false });
    b.provs.avatar.gate = vi.fn(async () => { b.app.disposed = true; });
    await b.app.startSequence(null);
    expect(b.log).toEqual([]);
    warn.mockRestore();
  });
});

// ---------------------------------------------------------------- Pause
describe('Pause: Figur …/Mitgliedsausweis', () => {
  const base = () => ({ onResume() {}, onSearch() {}, onClassic() {}, onQuality() {}, onSound() {}, onFps() {}, onBigCovers() {}, onTheme() {}, onMenu() {}, getQuality: () => 'auto', getSound: () => true, getFps: () => false, getBigCovers: () => true });
  const visible = (host, label) => [...host.querySelectorAll('button')].find((b) => b.textContent === label && !b.hidden);
  function mount(a) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const p = createPause(host, a);
    p.show();
    return { host, p };
  }
  it('ohne Callbacks ausgeblendet', () => {
    const { host, p } = mount(base());
    expect(visible(host, 'Figur …')).toBeUndefined();
    expect(visible(host, 'Mitgliedsausweis')).toBeUndefined();
    p.destroy(); host.remove();
  });
  it('Callback vorhanden, Enabled false → ausgeblendet; true → sichtbar und klickbar', () => {
    let on = false;
    const onFigure = vi.fn(); const onCard = vi.fn();
    const { host, p } = mount({ ...base(), onFigure, onCard, getFigureEnabled: () => on, getCardEnabled: () => on });
    expect(visible(host, 'Figur …')).toBeUndefined();
    expect(visible(host, 'Mitgliedsausweis')).toBeUndefined();
    on = true;
    p.refresh();
    visible(host, 'Figur …').click();
    visible(host, 'Mitgliedsausweis').click();
    expect(onFigure).toHaveBeenCalledTimes(1);
    expect(onCard).toHaveBeenCalledTimes(1);
    // Reihenfolge: hinter „Entdeckungen“
    const labels = [...host.querySelectorAll('button')].map((b) => b.textContent);
    expect(labels.indexOf('Figur …')).toBeGreaterThan(labels.indexOf('Suche'));
    p.destroy(); host.remove();
  });
  it('ohne Enabled-Callback genügt der Eintrag selbst', () => {
    const { host, p } = mount({ ...base(), onFigure() {}, onCard() {} });
    expect(visible(host, 'Figur …')).toBeTruthy();
    expect(visible(host, 'Mitgliedsausweis')).toBeTruthy();
    p.destroy(); host.remove();
  });
  it('StoreApp: Stubs liefern null → Einträge aus; echte Daten → Einträge an, onFigure öffnet den Editor', () => {
    const av = { code: () => null, openEditor: vi.fn(() => Promise.resolve(true)) };
    const mem = { cardData: () => null, showCard: vi.fn(() => Promise.resolve()) };
    const { app } = appStub({ pause: { hide: vi.fn() }, setMode: vi.fn() }, { avatar: av, member: mem });
    // Pause-Rückrufe stammen aus dem Konstruktor; hier nur die Logik über modUse nachgestellt
    expect(app.modUse('avatar').code()).toBeNull();
    expect(app.modUse('member').cardData()).toBeNull();
    expect(app.modUse('nichts')).toBeUndefined();
  });
});

// ---------------------------------------------------------------- Kamera-Rig
describe('ctx.player.camera.setRig', () => {
  function host() {
    const layout = buildLayout([{ id: 'new', label: 'Neuheiten', kind: 'new', color: '#f00', itemIds: ['a'] }]);
    const app = {
      layout, deps: { catalog: {}, toast() {} }, opts: {}, phone: false, touch: false, sound: false, xr: null,
      engine: { scene: {}, camera: new PerspectiveCamera(), renderer: {}, preset: { level: 'mid' } },
      player: new Player(layout),
    };
    return new ModuleHost(app);
  }
  it('läuft nur ohne flyTo; null löst', () => {
    const h = host();
    const rig = vi.fn(() => true);
    h.ctx.player.camera.setRig(rig);
    expect(h.cameraStep(0.1)).toBe(false);
    expect(rig).toHaveBeenCalledTimes(1);
    expect(rig.mock.calls[0][1]).toBeCloseTo(0.1);
    h.ctx.player.camera.flyTo({ x: 1, y: 2, z: 3 }, { x: 0, y: 0, z: 0 }, 500);
    rig.mockClear();
    expect(h.cameraStep(0.1)).toBe(true);
    expect(rig).not.toHaveBeenCalled();
    h.ctx.player.camera.release();
    expect(h.cameraStep(0.1)).toBe(false);
    expect(rig).toHaveBeenCalledTimes(1);
    h.ctx.player.camera.setRig(null);
    rig.mockClear();
    h.cameraStep(0.1);
    expect(rig).not.toHaveBeenCalled();
    h.dispose();
  });
  it('Rig-Fehler wirft nicht und löst das Rig', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const h = host();
    const rig = vi.fn(() => { throw new Error('boom'); });
    h.ctx.player.camera.setRig(rig);
    expect(() => h.cameraStep(0.1)).not.toThrow();
    h.cameraStep(0.1);
    expect(rig).toHaveBeenCalledTimes(1);
    warn.mockRestore();
    h.dispose();
  });
});

// ---------------------------------------------------------------- Stub-Module
describe('Stub-Provider (avatar, member, selfview, salon, shopmirror)', () => {
  it('sind registriert und liefern No-op-Werte', async () => {
    const names = ['avatar', 'member', 'selfview', 'shopmirror', 'salon'];
    const mods = ALL.filter((m) => names.includes(m.name));
    expect(mods.map((m) => m.name)).toEqual(names);
    const idx = (n) => ALL.findIndex((m) => m.name === n);
    expect(idx('avatar')).toBeGreaterThan(idx('discover'));
    expect(idx('salon')).toBeLessThan(idx('net'));
    const layout = buildLayout([{ id: 'new', label: 'Neuheiten', kind: 'new', color: '#f00', itemIds: ['a'] }]);
    const app = {
      layout, deps: { catalog: {}, toast() {} }, opts: {}, phone: false, touch: false, sound: false, xr: null,
      engine: { scene: {}, camera: new PerspectiveCamera(), renderer: {}, preset: { level: 'mid' } },
      player: new Player(layout),
    };
    MODULES.length = 0;
    MODULES.push(...mods);
    const h = new ModuleHost(app);
    await h.init();
    const av = h.ctx.use('avatar');
    expect([av.needsGate(), av.look(), av.code(), av.slots(), av.active(), av.hash(), av.changedFor('richard'), av.lastChange()]).toEqual([false, null, null, [null, null, null], 0, '', false, 0]);
    await expect(av.gate()).resolves.toBeUndefined();
    await expect(av.openEditor('pause')).resolves.toBe(false);
    expect(typeof av.onChange(() => {})).toBe('function');
    const m = h.ctx.use('member');
    expect([m.cardData(), m.count('rent', 'x')]).toEqual([null, false]);
    await expect(m.showCard(null, { mode: 'self' })).resolves.toBeUndefined();
    const sv = h.ctx.use('selfview');
    expect([sv.mode(), sv.figure()]).toEqual(['ego', null]);
    expect(sv.eye(new Vector3()).toArray()).toEqual(app.engine.camera.position.toArray());
    sv.toggle(); sv.setMode('third'); sv.playAnim('wave');
    expect(sv.mode()).toBe('ego');
    expect([h.ctx.use('salon').busy(), h.ctx.use('salon').inside()]).toEqual([false, false]);
    expect(h.ctx.use('shopmirror')).toBeTruthy();
    h.dispose();
  });
});
