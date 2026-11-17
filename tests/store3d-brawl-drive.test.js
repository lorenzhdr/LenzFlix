// @vitest-environment jsdom
// Richard treibt den Spieler per Pfad zur Tür: stillstehend vor dem Tresen, im Kassenbereich, auf dem Tresen, beim Wegrennen;
// Rückfall-Rauswurf (Abblender, Versetzen, sofort Hausverbot). Simulierter Spieler mit Stoß (knock) und Kreis-Kollision.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { Scene, PerspectiveCamera } from 'three';
import { MODULES } from '../src/js/store3d/modules/index.js';
import { ModuleHost } from '../src/js/store3d/modules/runtime.js';
import { buildLayout } from '../src/js/store3d/world/layout.js';
import { resolveCircle } from '../src/js/store3d/nav/path.js';
import cashier from '../src/js/store3d/modules/cashier.js';
import brawl from '../src/js/store3d/modules/brawl.js';

function mkCanvasCtx() {
  return function getContext() {
    return new Proxy({}, {
      get: (t, k) => (k in t ? t[k] : (k === 'measureText' ? () => ({ width: 10 }) : () => ({ addColorStop() {} }))),
      set: (t, k, v) => { t[k] = v; return true; },
    });
  };
}

describe('Richard treibt den Spieler hinaus', () => {
  let host; let dom;
  const realGetContext = HTMLCanvasElement.prototype.getContext;
  beforeEach(() => {
    MODULES.length = 0; MODULES.push(cashier, brawl);
    HTMLCanvasElement.prototype.getContext = mkCanvasCtx();
    try { sessionStorage.clear(); } catch { /* egal */ }
  });
  afterEach(() => {
    if (host) host.hook('dispose');
    host = null; if (dom) dom.remove();
    HTMLCanvasElement.prototype.getContext = realGetContext;
    MODULES.length = 0;
    delete window.__lfxBrawl;
  });

  /** Spieler mit Stoß: knock addiert Geschwindigkeit (4 m/s * Stärke), klingt ab (6/s); Kollision gegen layout.colliders (Boden). */
  async function build({ x, z, y = 0, knockWorks = true }) {
    const layout = buildLayout([{ id: 'new', label: 'Neuheiten', kind: 'new', color: '#f00', itemIds: ['c1'] }]);
    const items = new Map([['c1', { Id: 'c1', Name: 'Titel', Genres: [], Type: 'Movie', lfx: { media: 'vhs' } }]]);
    dom = document.createElement('div');
    const canvas = document.createElement('canvas');
    dom.appendChild(canvas);
    document.body.appendChild(dom);
    const P = { x, z, y, yaw: Math.PI, pitch: 0, vx: 0, vz: 0, kx: 0, kz: 0, vel: { x: 0, z: 0 }, tele: [] };
    const knocks = [];
    const door = { lock: vi.fn(), unlock: vi.fn(), isLocked: () => false, onChange() {}, registerActor() {}, override() {}, open() {}, amount: () => 0 };
    const app = {
      layout,
      deps: { catalog: { items, departments: [], highlights: [], resume: [] }, toast: vi.fn(), user: { name: 'Max' } },
      opts: { debug: true }, phone: false, touch: false, sound: false, mode: 'play',
      engine: { scene: new Scene(), camera: new PerspectiveCamera(), renderer: { domElement: canvas }, preset: { level: 'mid' } },
      player: {
        get state() { return { x: P.x, z: P.z, yaw: P.yaw, pitch: P.pitch }; },
        get y() { return P.y; },
        cancelPath() {}, eyeY: () => 1.65, turnTo: null, moved: 0,
        teleport(tx, tz, yaw, pitch, ty) { P.x = tx; P.z = tz; P.y = ty || 0; P.yaw = yaw; P.kx = 0; P.kz = 0; P.tele.push([tx, tz, yaw]); },
        knock(dir, s = 1) {
          knocks.push({ x: dir.x, z: dir.z });
          if (!knockWorks) return;
          const l = Math.hypot(dir.x, dir.z) || 1;
          P.kx += (dir.x / l) * 4 * s; P.kz += (dir.z / l) * 4 * s;
        },
      },
      getCarried: () => null,
      setMode(m) { app.mode = m; }, holdview: { isOpen: false }, findSlot: () => null, take: vi.fn(), host: dom,
    };
    host = new ModuleHost(app);
    host.providers.set('door', door);
    await host.init();
    const R = host.providers.get('cashier').richard();
    const rects = () => [...layout.colliders.filter((q) => q.y1 === undefined || q.y1 > 0.05 + (P.y || 0)), ...(layout.dyn || [])];
    // Spielerphysik: Stoß, optionaler Eigenantrieb (ai(dt) → { vx, vz })
    function stepPlayer(dt, ai) {
      const f = Math.exp(-6 * dt);
      P.kx *= f; P.kz *= f;
      const w = ai ? ai(dt) : { vx: 0, vz: 0 };
      const r = resolveCircle(P.x + (P.kx + w.vx) * dt, P.z + (P.kz + w.vz) * dt, 0.3, rects().filter((q) => !(q.x0 <= P.x && P.x <= q.x1 && q.z0 <= P.z && P.z <= q.z1)));
      P.x = r.x; P.z = r.z;
    }
    return { layout, P, R, door, knocks, stepPlayer };
  }

  /** Simuliert bis Hausverbot + Spieler draußen; Rückgabe Sekunden (oder null). Prüft nebenbei: Richard nie am Boden auf dem Tresen. */
  function run(c, { ai, maxSec = 40, dt = 0.05 } = {}) {
    const { layout, P, R, stepPlayer } = c;
    const ct = layout.counter;
    let t = 1;
    host.hook('update', dt, t);
    const bw = host.providers.get('brawl');
    window.__lfxBrawl.force('chase');
    const t0 = t;
    let onCounterTicks = 0;
    for (let i = 0; i < maxSec / dt; i++) {
      t += dt;
      stepPlayer(dt, ai);
      host.hook('update', dt, t);
      if (R.pos.y < 0.3 && R.pos.x >= ct.x0 && R.pos.x <= ct.x1 && R.pos.z > ct.z0 + 0.05 && R.pos.z < ct.z1 - 0.05) onCounterTicks++;
      if (bw.state() === 'banned' && P.z > layout.d) return { sec: t - t0, onCounterTicks, bw, t };
    }
    return { sec: null, onCounterTicks, bw };
  }

  it('Spieler steht still direkt vor dem Tresen: Hausverbot, Tür gesperrt, Spieler draußen in ≤ 15 s; Richard nie auf dem Tresen', async () => {
    const c = await build({ x: 12.7, z: 0 });
    c.P.x = c.layout.w - 2.9; c.P.z = c.layout.counter.z0 - 0.1;
    const r = run(c);
    expect(r.sec).not.toBeNull();
    expect(r.sec).toBeLessThanOrEqual(15);
    expect(r.bw.isBanned()).toBe(true);
    expect(c.door.lock).toHaveBeenCalled();
    expect(r.onCounterTicks).toBe(0);
  });

  it('Spieler im Kassenbereich (geschlossen): Rückfall nach wenigen Sekunden, versetzt vor die Tür mit Blick zur Tür', async () => {
    const c = await build({ x: 0, z: 0 });
    c.P.x = c.layout.w - 2.0; c.P.z = c.layout.d - 1.6;
    const r = run(c);
    expect(r.sec).not.toBeNull();
    expect(r.sec).toBeLessThanOrEqual(8);
    expect(c.P.tele.length).toBe(1);
    expect(c.P.tele[0][2]).toBe(0); // Blick nach Norden = zur Tür
    expect(c.P.z).toBeGreaterThan(c.layout.d + 1);
    expect(c.door.lock).toHaveBeenCalled();
  });

  it('Spieler steht auf dem Tresen: wird hinausgetrieben, Richard bleibt am Boden', async () => {
    const c = await build({ x: 0, z: 0 });
    const ct = c.layout.counter;
    c.P.x = c.layout.w - 2.9; c.P.z = (ct.z0 + ct.z1) / 2; c.P.y = 1.05;
    const r = run(c);
    expect(r.sec).not.toBeNull();
    expect(r.sec).toBeLessThanOrEqual(15);
    expect(r.onCounterTicks).toBe(0);
    expect(c.door.lock).toHaveBeenCalled();
  });

  it('Spieler rennt schneller als Richard weg: Rückfall-Rauswurf nach ca. 12 s, danach sofort Hausverbot', async () => {
    const c = await build({ x: 0, z: 0 });
    const { P } = c;
    P.x = c.layout.w - 2.9; P.z = c.layout.counter.z0 - 0.6;
    // läuft ständig von Richard weg (5 m/s), bleibt im Laden
    const ai = () => {
      const R = c.R.pos;
      const dx = P.x - R.x; const dz = P.z - R.z; const l = Math.hypot(dx, dz) || 1;
      // nie durch die Tür nach draußen: in der Ladenmitte kreisen
      return { vx: (dx / l) * 5, vz: (dz / l) * 5 };
    };
    const r = run(c, { ai, maxSec: 25 });
    expect(r.sec).not.toBeNull();
    expect(r.sec).toBeGreaterThanOrEqual(11.5);
    expect(r.sec).toBeLessThanOrEqual(14.5);
    expect(c.P.tele.length).toBe(1);
    expect(c.door.lock).toHaveBeenCalled();
    host.hook('update', 0.05, r.t + 0.05);
    expect(dom.querySelector('.lfx-store-banhud').hidden).toBe(false);
  });

  it('Rückfall: Stoß wirkungslos (Spieler klemmt) → Abblender, Versetzen vor die Tür, Hausverbot, Abblender weg', async () => {
    const c = await build({ x: 0, z: 0, knockWorks: false });
    c.P.x = 2; c.P.z = 2; // Ecke weit weg
    const veil = dom.querySelector('.lfx-store-expelveil');
    expect(veil).not.toBeNull();
    const r = run(c, { maxSec: 30 });
    expect(r.sec).not.toBeNull();
    expect(r.sec).toBeGreaterThanOrEqual(11.5);
    expect(r.sec).toBeLessThanOrEqual(14);
    expect(c.P.tele[0][0]).toBeCloseTo((c.layout.door.x0 + c.layout.door.x1) / 2, 1);
    expect(r.bw.isBanned()).toBe(true);
    expect(c.door.lock).toHaveBeenCalled();
    // nach dem Versetzen ist der Abblender wieder aus
    let t = 100;
    for (let i = 0; i < 20; i++) { t += 0.1; host.hook('update', 0.1, t); }
    expect(veil.hidden || veil.style.opacity === '0').toBe(true);
  });

  it('Nach dem Hausverbot kehrt Richard sicher hinter den Tresen zurück (Grudge, Position im Kassenbereich)', async () => {
    const c = await build({ x: 0, z: 0, knockWorks: false });
    c.P.x = 2; c.P.z = 2;
    const r = run(c, { maxSec: 30 });
    expect(r.bw.isBanned()).toBe(true);
    let t = 200;
    const ct = c.layout.counter;
    for (let i = 0; i < 1200 && !(r.bw.state() === 'grudge' && c.R.pos.z > ct.z1 && c.R.pos.y < 0.05); i++) { t += 0.05; host.hook('update', 0.05, t); }
    expect(r.bw.state()).toBe('grudge');
    expect(c.R.pos.z).toBeGreaterThan(ct.z1);
    expect(c.R.pos.x).toBeGreaterThan(ct.x0);
  });
});
