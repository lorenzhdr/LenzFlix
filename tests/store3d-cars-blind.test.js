// @vitest-environment jsdom
// 1.18.0 Laser auf Autofahrer: Vollbremsung 9 m/s², 2,5 s stehen und hupen, Folgeautos halten Abstand, Provider laserHit/blindDriver.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { Scene, PerspectiveCamera, Group } from 'three';
import { buildCity } from '../src/js/store3d/world/city.js';
import { createCar, stepCar, blindCar, laneSign, CAR_LEN, BLIND_DEC, BLIND_STAND } from '../src/js/store3d/npc/cars-logic.js';
import { MODULES } from '../src/js/store3d/modules/index.js';
import { ModuleHost } from '../src/js/store3d/modules/runtime.js';
import { buildLayout } from '../src/js/store3d/world/layout.js';
import traffic from '../src/js/store3d/modules/traffic.js';
import { seeded } from '../src/js/store3d/modules/m4-util.js';

const city = buildCity({ w: 20, d: 16 });
const lane = city.lanes.find((l) => l.id === 'mainE');
const envFor = (cars) => ({ lane, zebras: city.zebras, signal: { main: 'green', side: 'green' }, cars, obstacles: [], zebraOccupied: () => false, rand: seeded(1) });

describe('Auto-Fahrlogik: geblendeter Fahrer', () => {
  it('bremst mit 9 m/s² bis zum Stillstand, steht 2,5 s und fährt dann wieder an', () => {
    expect(BLIND_DEC).toBe(9);
    expect(BLIND_STAND).toBe(2.5);
    const s = laneSign(lane);
    const car = createCar(lane, { id: 1, p: lane.from + s * 40, v: lane.speed });
    expect(blindCar(car)).toBe(true);
    const env = envFor([car]);
    const v0 = car.v;
    stepCar(car, 0.1, env);
    expect(v0 - car.v).toBeCloseTo(0.9, 5); // 9 m/s² · 0,1 s
    let t = 0.1;
    let stoppedAt = null;
    const evs = [];
    while (t < 12 && car.state === 'blind') { evs.push(...stepCar(car, 0.05, env)); t += 0.05; if (car.v === 0 && stoppedAt === null) stoppedAt = t; }
    expect(stoppedAt).not.toBeNull();
    expect(t - stoppedAt).toBeGreaterThan(2.3);
    expect(t - stoppedAt).toBeLessThan(2.7);
    expect(car.state).toBe('drive');
    const honks = evs.filter((e) => e.type === 'honk');
    expect(honks.length).toBeGreaterThanOrEqual(3);
    expect(honks.every((e) => e.long && !e.toPlayer)).toBe(true);
    for (let i = 0; i < 40; i++) stepCar(car, 0.05, env);
    expect(car.v).toBeGreaterThan(1);
  });

  it('Folgeauto hält Abstand zum blinden Vordermann (kein Unfall)', () => {
    const s = laneSign(lane);
    const lead = createCar(lane, { id: 1, p: lane.from + s * 40, v: lane.speed });
    const back = createCar(lane, { id: 2, p: lead.p - s * 14, v: lane.speed });
    const env = envFor([lead, back]);
    blindCar(lead);
    let minGap = Infinity;
    for (let t = 0; t < 8; t += 0.05) {
      stepCar(lead, 0.05, env);
      stepCar(back, 0.05, env);
      minGap = Math.min(minGap, (lead.p - back.p) * s - CAR_LEN);
    }
    expect(minGap).toBeGreaterThan(0.3);
  });

  it('abwesende Autos (away) lassen sich nicht blenden', () => {
    const car = createCar(lane, { id: 1 });
    car.state = 'away';
    expect(blindCar(car)).toBe(false);
  });
});

function mkCanvasCtx() {
  return function getContext() {
    return new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'measureText' ? () => ({ width: 10 }) : () => ({ addColorStop() {} }))), set: (t, k, v) => { t[k] = v; return true; } });
  };
}

describe('Provider traffic: laserHit / blindDriver', () => {
  let host;
  let dom;
  let sounds;
  let appRef;
  const realGetContext = HTMLCanvasElement.prototype.getContext;
  beforeEach(() => { HTMLCanvasElement.prototype.getContext = mkCanvasCtx(); });
  afterEach(() => { if (host) host.hook('dispose'); host = null; if (dom) dom.remove(); HTMLCanvasElement.prototype.getContext = realGetContext; MODULES.length = 0; });

  async function build() {
    const layout = buildLayout([{ id: 'new', label: 'Neuheiten', kind: 'new', color: '#f00', itemIds: ['c1'] }]);
    sounds = [];
    const groups = { street: new Group(), yard: new Group(), palast: new Group(), palastInterior: new Group() };
    const fakeCity = {
      name: 'fakecity',
      init(ctx) {
        for (const g of Object.values(groups)) ctx.scene.add(g);
        ctx.provide('city', { data: layout.city, groups, signals: () => ({ main: 'green', side: 'green', walkMain: false, walkSide: false }), visible: () => ({}) });
        ctx.provide('weather', { tod: 'day', raining: false, hour: 14 });
        ctx.provide('sound', { play: (n) => sounds.push(n) });
      },
    };
    MODULES.length = 0;
    MODULES.push(fakeCity, traffic);
    dom = document.createElement('div');
    const canvas = document.createElement('canvas');
    dom.appendChild(canvas);
    document.body.appendChild(dom);
    const state = { x: 10, z: 20, yaw: 0, pitch: 0 };
    const app = {
      layout, deps: { catalog: { items: new Map(), departments: [], highlights: [], resume: [] }, toast: vi.fn(), user: { name: 'Max' } },
      opts: { debug: true, devFlags: { cars: true } }, phone: false, touch: false, sound: false, mode: 'play',
      engine: { scene: new Scene(), camera: new PerspectiveCamera(70, 1.5, 0.05, 90), renderer: { domElement: dom.firstChild }, preset: { level: 'mid' } },
      player: { ...state, y: 0, state, cancelPath() {}, teleport: vi.fn(), knock: vi.fn(), moved: 0 },
      setMode(m) { app.mode = m; }, holdview: { isOpen: false }, findSlot: () => null, take: vi.fn(), host: dom,
    };
    host = new ModuleHost(app);
    await host.init();
    appRef = app;
    return host.ctx.use('traffic');
  }

  it('laserHit trifft die Kabine eines Autos, blindDriver bremst es und es hupt', async () => {
    const tr = await build();
    host.hook('update', 0.05, 0);
    const c = tr.cars()[0];
    expect(tr.laserHit({ x: c.x, y: 1.2, z: c.z })).toMatchObject({ lane: c.lane });
    expect(tr.laserHit({ x: c.x, y: 0.2, z: c.z })).toBeNull(); // unter der Kabine
    expect(tr.laserHit({ x: c.x + 50, y: 1.2, z: c.z + 50 })).toBeNull();
    const ref = tr.laserHit({ x: c.x, y: 1.2, z: c.z });
    expect(tr.blindDriver(ref)).toBe(true);
    expect(tr.blindDriver(9999)).toBe(false);
    { const p = appRef.player; p.state.x = c.x; p.state.z = c.z + 3; p.x = c.x; p.z = c.z + 3; }
    for (let i = 0; i < 60; i++) host.hook('update', 0.05, i * 0.05);
    const after = tr.cars().find((x) => x.lane === c.lane);
    expect(['blind', 'drive']).toContain(after.state);
    expect(sounds.filter((s) => s === 'honk').length).toBeGreaterThanOrEqual(1);
  });
});
