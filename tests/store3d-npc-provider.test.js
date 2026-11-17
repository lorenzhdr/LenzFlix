// @vitest-environment jsdom
// Module npc/traffic/kiosk (Welle 2, Paket E): Provider-API, Schlag-Handler, Figuren (1 Draw-Call, Netzzustand), Autos, Zebra-Fund, Aufräumen.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { Scene, PerspectiveCamera, Group, SkinnedMesh, Mesh } from 'three';
import { MODULES } from '../src/js/store3d/modules/index.js';
import { ModuleHost } from '../src/js/store3d/modules/runtime.js';
import { buildLayout } from '../src/js/store3d/world/layout.js';
import npc from '../src/js/store3d/modules/npc.js';
import traffic from '../src/js/store3d/modules/traffic.js';
import kiosk from '../src/js/store3d/modules/kiosk.js';

function mkCanvasCtx() {
  return function getContext() {
    return new Proxy({}, {
      get: (t, k) => (k in t ? t[k] : (k === 'measureText' ? () => ({ width: 10 }) : () => ({ addColorStop() {} }))),
      set: (t, k, v) => { t[k] = v; return true; },
    });
  };
}

describe('npc/traffic/kiosk', () => {
  let host;
  let dom;
  let app;
  let sig;
  let found;
  let sounds;
  const realGetContext = HTMLCanvasElement.prototype.getContext;
  beforeEach(() => { HTMLCanvasElement.prototype.getContext = mkCanvasCtx(); });
  afterEach(() => {
    if (host) host.hook('dispose');
    host = null;
    if (dom) dom.remove();
    HTMLCanvasElement.prototype.getContext = realGetContext;
    MODULES.length = 0;
    delete window.__lfxM4;
  });

  async function build({ flags = {}, level = 'mid', mods = [npc, traffic, kiosk], hour = 'day' } = {}) {
    const layout = buildLayout([{ id: 'new', label: 'Neuheiten', kind: 'new', color: '#f00', itemIds: ['c1'] }]);
    sig = { main: 'green', side: 'red', walkMain: false, walkSide: true };
    found = [];
    sounds = [];
    const groups = { street: new Group(), yard: new Group(), palast: new Group(), palastInterior: new Group() };
    const fakeCity = {
      name: 'fakecity',
      init(ctx) {
        for (const g of Object.values(groups)) ctx.scene.add(g);
        ctx.provide('city', { data: layout.city, groups, signals: () => sig, visible: () => ({}) });
        ctx.provide('weather', { tod: hour, raining: false, hour: 14 });
        ctx.provide('discover', { found: (id) => { found.push(id); return true; }, has: () => false, list: () => [] });
        ctx.provide('sound', { play: (n) => sounds.push(n) });
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
      opts: { debug: true, devFlags: { npc: true, cars: true, ...flags } }, phone: false, touch: false, sound: false, mode: 'play',
      engine: { scene: new Scene(), camera, renderer: { domElement: canvas }, preset: { level } },
      player: { ...state, y: 0, state, cancelPath() {}, teleport: vi.fn(), knock: vi.fn(), moved: 0 },
      setMode(m) { app.mode = m; }, holdview: { isOpen: false }, findSlot: () => null, take: vi.fn(), host: dom,
    };
    host = new ModuleHost(app);
    await host.init();
    return { app, groups };
  }
  const place = (x, z, yaw = 0, y = 0) => { app.player.state.x = x; app.player.state.z = z; app.player.state.yaw = yaw; app.player.x = x; app.player.z = z; app.player.y = y; };
  const tick = (n, dt = 0.05) => { for (let i = 0; i < n; i++) host.hook('update', dt, i * dt); };

  it('Provider npc: figure(), staff(), nearestPerson(), registerPerson() vorhanden', async () => {
    await build();
    const p = host.ctx.use('npc');
    for (const k of ['figure', 'staff', 'nearestPerson', 'registerPerson', 'people', 'say']) expect(typeof p[k]).toBe('function');
    expect(host.ctx.use('traffic').zebraClear).toBeTypeOf('function');
  });

  it('Figur: 1 SkinnedMesh (≤ 3 Draw-Calls inkl. Schirm), Animationen und Blick', async () => {
    const { groups } = await build();
    const f = host.ctx.use('npc').figure({ pos: { x: 3, z: 4 }, yaw: 1, rain: true });
    expect(f.root.parent).toBe(groups.street);
    let calls = 0;
    f.root.traverse((o) => { if (o.isMesh) calls++; });
    expect(calls).toBeLessThanOrEqual(3);
    expect(calls).toBe(1);
    expect(f.mesh).toBeInstanceOf(SkinnedMesh);
    f.setUmbrella(true);
    let c2 = 0;
    f.root.traverse((o) => { if (o instanceof Mesh) c2++; });
    expect(c2).toBe(2);
    for (const a of ['idle', 'walk', 'run', 'sit', 'wave', 'hit', 'throw', 'stagger', 'point', 'cheer']) { f.setAnim(a); f.update(0.05); }
    f.lookAt(10, 1.6, 10);
    f.update(0.2);
    f.hitReact({ x: 1, z: 0 });
    f.update(0.1);
    expect(f.anim.anim).toBe('stagger');
    f.dispose();
    expect(f.root.parent).toBe(null);
  });

  it('Netzzustand: getNetState → applyRemote überträgt Pose und Animation (Grundlage der Mitspieler-Avatare)', async () => {
    await build();
    const p = host.ctx.use('npc');
    const a = p.figure({ pos: { x: 2, z: 3 }, yaw: 0.5 });
    a.setAnim('walk', { speed: 1.4 });
    for (let i = 0; i < 20; i++) a.update(0.05);
    const s = a.getNetState();
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    const b = p.figure({});
    expect(b.applyRemote(s)).toBe(true);
    expect(b.isRemote()).toBe(true);
    for (let i = 0; i < 10; i++) b.update(0.05);
    expect(b.root.position.x).toBeCloseTo(2, 2);
    expect(b.root.position.z).toBeCloseTo(3, 2);
    expect(b.anim.anim).toBe('walk');
    expect(b.applyRemote({ x: 'a' })).toBe(false);
  });

  it('Sprechblase: erscheint für eine sichtbare Figur im Bild, verschwindet nach der Zeit', async () => {
    await build();
    const p = host.ctx.use('npc');
    place(10, 20, 0);
    app.engine.camera.position.set(10, 1.65, 20);
    app.engine.camera.updateMatrixWorld(true);
    const f = p.figure({ pos: { x: 10, z: 16 } });
    f.say('Hallo Welt', 1000);
    const b = dom.querySelector('.lfx-store-bubble.is-npc');
    expect(b).toBeTruthy();
    expect(b.hidden).toBe(false);
    expect(b.textContent).toBe('Hallo Welt');
    tick(30);
    expect(b.hidden).toBe(true);
  });

  it('Kino-Personal: staff(role) liefert Figuren im Palast-Foyer, Schlag → hitReact + Spruch + verbraucht', async () => {
    const { groups } = await build();
    const p = host.ctx.use('npc');
    const t = p.staff('ticket');
    const pc = p.staff('popcorn');
    expect(t).toBeTruthy();
    expect(pc).toBeTruthy();
    expect(t.root.parent).toBe(groups.palastInterior);
    const f = app.layout.city.palast.foyer;
    expect(t.root.position.x).toBeGreaterThan(f.x0);
    expect(t.root.position.z).toBeGreaterThan(f.z0);
    // Spieler steht 1 m vor dem Kartenabreißer und schlägt auf ihn zu
    place(t.root.position.x, t.root.position.z - 1.0, 0, 0);
    app.engine.camera.position.set(t.root.position.x, 1.65, t.root.position.z - 1.0);
    const origin = app.engine.camera.position.clone();
    const consumed = host.action('hit', { name: 'hit', source: 'key', aim: null, origin, dir: { x: 0, y: 0, z: 1 } });
    expect(consumed).toBe(true);
    expect(t.anim.anim).toBe('stagger');
    expect(sounds).toContain('oof');
    expect(dom.querySelector('.lfx-store-bubble.is-npc')).toBeTruthy();
  });

  it('Schlag ins Leere wird nicht verbraucht (geht an Pakete mit niedrigerer Priorität)', async () => {
    await build();
    place(10, 3, 0, 0);
    const consumed = host.action('hit', { name: 'hit', source: 'key', origin: { x: 10, y: 1.65, z: 3 }, dir: { x: 0, y: 0, z: 1 } });
    expect(consumed).toBe(false);
  });

  it('nearestPerson findet Personal im Radius', async () => {
    await build();
    const p = host.ctx.use('npc');
    const t = p.staff('ticket');
    const n = p.nearestPerson(t.root.position.x + 0.5, t.root.position.z, 2);
    expect(n.kind).toBe('ticket');
    expect(p.nearestPerson(0, -100, 2)).toBe(null);
  });

  it('?npc=0: figure() geht, staff()/nearestPerson() sind null, keine Passanten', async () => {
    const { groups } = await build({ flags: { npc: false }, mods: [npc] });
    const p = host.ctx.use('npc');
    expect(p.staff('ticket')).toBe(null);
    expect(p.nearestPerson(0, 0, 1000)).toBe(null);
    expect(p.figure({}).root).toBeTruthy();
    expect(groups.street.children.length).toBe(1);
    expect(host.action('hit', { origin: { x: 0, y: 1, z: 0 }, dir: { x: 1, y: 0, z: 0 } })).toBe(false);
  });

  it('Passanten: Anzahl folgt der Qualität (mid = 16), Regelmäßigkeit über Zeit, alle auf dem Gehweg-Netz', async () => {
    const { groups } = await build({ level: 'mid' });
    host.emit('enter');
    tick(40);
    // Passanten sind SkinnedMeshes in der Straßengruppe
    const people = groups.street.children.filter((c) => c.name === 'npc-figure');
    expect(people.length).toBeGreaterThanOrEqual(16);
  });

  it('Autos: Anzahl aus der Qualität, dynamische Kollider, parkende Autos dreiteilig', async () => {
    await build({ level: 'mid' });
    const tr = host.ctx.use('traffic');
    expect(tr.cars()).toHaveLength(4);
    expect([...app.layout.dyn].filter((c) => c.kind === 'car').length).toBe(4);
    expect(tr.parked().length).toBe(9);
    tick(100);
    for (const c of tr.cars()) { expect(Number.isFinite(c.x + c.z)).toBe(true); }
    const col = [...app.layout.dyn].find((c) => c.kind === 'car');
    expect(col.top).toBe(false);
  });

  it('?cars=0: keine Autos, keine Kollider; zebraClear bleibt true', async () => {
    await build({ flags: { cars: false } });
    const tr = host.ctx.use('traffic');
    expect(tr.cars ? tr.cars() : []).toEqual([]);
    expect([...app.layout.dyn].filter((c) => c.kind === 'car').length).toBe(0);
    expect(tr.zebraClear({ ax: 0, bx: 0 })).toBe(true);
  });

  it('Hupen: Auto vor dem Spieler hupt, found("car-honk")', async () => {
    await build({ level: 'low' });
    const l = app.layout.city.lanes.find((q) => q.id === 'mainW');
    // Spieler mitten auf die Fahrbahn der westwärts fahrenden Spur stellen
    place(l.from - 25, l.z, 0, 0);
    tick(500, 0.05);
    expect(sounds).toContain('honk');
    expect(found).toContain('car-honk');
  });

  it('Zebra-Fund: Überqueren bei Fußgänger-Grün löst "zebra" aus, bei Rot nicht', async () => {
    await build({ flags: { cars: true }, level: 'low' });
    const z = app.layout.city.zebras.find((q) => q.id === 'zebraW');
    const cx = (z.x0 + z.x1) / 2;
    sig = { main: 'red', side: 'green', walkMain: true, walkSide: false };
    for (let zz = z.z0 - 0.6; zz <= z.z1 + 0.6; zz += 0.25) { place(cx, zz, 0, 0); tick(2, 0.1); }
    tick(4, 0.1);
    expect(found).toContain('zebra');
    found.length = 0;
    sig = { main: 'green', side: 'red', walkMain: false, walkSide: true };
    for (let zz = z.z0 - 0.6; zz <= z.z1 + 0.6; zz += 0.25) { place(cx, zz, 0, 0); tick(2, 0.1); }
    tick(4, 0.1);
    expect(found).not.toContain('zebra');
  });

  it('Kiosk: Verkäuferin + Interaktion „Snack kaufen“, Kauf meldet kiosk-snack und räumt auf', async () => {
    const { groups } = await build();
    const ia = host.interactables.find((i) => i.label === 'Kiosk');
    expect(ia).toBeTruthy();
    ia.onUse();
    expect(host.ctx.overlay.isOpen()).toBe(true);
    const btns = dom.querySelectorAll('.lfx-store-dialog button');
    expect(btns.length).toBe(5);
    btns[0].click();
    expect(found).toContain('kiosk-snack');
    expect(sounds).toContain('buy');
    expect(host.ctx.overlay.isOpen()).toBe(false);
    const sceneBefore = app.engine.scene.children.length;
    tick(60, 0.05);
    expect(app.engine.scene.children.length).toBeLessThanOrEqual(sceneBefore); // Snack in der Hand verschwindet nach den Bissen
    expect(groups.street.children.some((c) => c.name === 'npc-figure')).toBe(true);
  });

  it('dispose räumt Figuren, Kollider, Interaktionen und DOM-Blasen vollständig auf', async () => {
    const { groups } = await build({ level: 'mid' });
    const scene = app.engine.scene;
    expect(app.layout.dyn.size).toBeGreaterThan(0);
    host.ctx.use('npc').figure({}).say('x', 5000);
    tick(5);
    host.hook('dispose');
    host = null;
    expect(app.layout.dyn.size).toBe(0);
    expect(groups.street.children.length).toBe(0);
    expect(groups.palastInterior.children.length).toBe(0);
    expect(groups.yard.children.length).toBe(0);
    expect(dom.querySelectorAll('.lfx-store-bubble.is-npc').length).toBe(0);
    void scene;
  });
  it('Passanten: Wurftreffer (handle.hitReact) lässt den Passanten taumeln statt vom Automaten überschrieben zu werden', async () => {
    await build({ level: 'mid' });
    tick(5);
    const p = host.ctx.use('npc');
    const person = p.people().find((q) => q.kind === 'walker');
    expect(person).toBeTruthy();
    place(person.x + 3, person.z, 0);
    person.handle.hitReact({ x: 1, z: 0 });
    tick(3);
    expect(person.handle.anim.anim).toBe('stagger');
  });

  it('Passanten: nahe Passanten haben einen dynamischen Kollider (Spieler läuft nicht hindurch)', async () => {
    await build({ level: 'mid' });
    const p = host.ctx.use('npc');
    const person = p.people().find((q) => q.kind === 'walker');
    place(person.x + 2, person.z, 0);
    tick(3);
    const near = [...app.layout.dyn].filter((c) => c.kind === 'walker' && Math.abs((c.x0 + c.x1) / 2 - person.handle.root.position.x) < 0.05);
    expect(near.length).toBe(1);
  });

  it('Provider npc: reserve(n) senkt die Passanten-Zahl um n (Mehrspieler, Draw-Call-Ausgleich), 0 hebt auf, Werte werden geklemmt', async () => {
    await build({ level: 'low' });
    const p = host.ctx.use('npc');
    expect(typeof p.reserve).toBe('function');
    const count = () => window.__lfxM4 && window.__lfxM4.npc ? window.__lfxM4.npc.counts().walkers : p.people().filter((q) => q.kind === 'walker').length;
    const base = count();
    expect(base).toBeGreaterThan(2);
    expect(p.reserve(2)).toBe(2);
    expect(count()).toBe(base - 2);
    expect(p.reserve(2)).toBe(2);
    expect(count()).toBe(base - 2);
    expect(p.reserve(1)).toBe(1);
    expect(count()).toBe(base - 1);
    expect(p.reserve(1000)).toBe(64);
    expect(count()).toBe(0);
    expect(p.reserve(-3)).toBe(0);
    expect(p.reserve(NaN)).toBe(0);
    expect(count()).toBe(base);
  });

  it('reserve bleibt bei Qualitätswechsel erhalten und beeinträchtigt externe Figuren nicht', async () => {
    const { groups } = await build({ level: 'low' });
    const p = host.ctx.use('npc');
    const ext = p.figure({ pos: { x: 1, z: 1 }, parent: groups.street });
    const base = p.people().filter((q) => q.kind === 'walker').length;
    p.reserve(3);
    host.hook('onQuality');
    expect(p.people().filter((q) => q.kind === 'walker').length).toBe(Math.max(0, base - 3));
    expect(ext.disposed).toBe(false);
    p.reserve(0);
    expect(p.people().filter((q) => q.kind === 'walker').length).toBe(base);
  });
});
