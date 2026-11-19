// @vitest-environment jsdom
// VIDEOTHEK LENZ · Wetter-Kette (1.19.0, Fix-Paket wx): Abruf-Takt in daytime (Sichtbarkeit, Wiederholung, Uhr, Platzhalter, snap). Fake-deps.weather, kein Netzwerk.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { Scene, PerspectiveCamera } from 'three';
import { MODULES } from '../src/js/store3d/modules/index.js';
import { ModuleHost } from '../src/js/store3d/modules/runtime.js';
import precip from '../src/js/store3d/modules/precip.js';
import daytime from '../src/js/store3d/modules/daytime.js';
import { buildLayout } from '../src/js/store3d/world/layout.js';

const real = (o) => ({ k: 'clear', i: 0, sd: 0, fog: 0, t: 8, day: 1, ts: 1, stale: 0, ...o });
function mkCanvasCtx() {
  return function getContext() {
    return new Proxy({}, {
      get: (t, k) => (k in t ? t[k] : (k === 'measureText' ? () => ({ width: 10 }) : () => ({ addColorStop() {} }))),
      set: (t, k, v) => { t[k] = v; return true; },
    });
  };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('daytime: Abruf-Takt des echten Wetters', () => {
  let host;
  let dom;
  let nowMs;
  let spy;
  const realGetContext = HTMLCanvasElement.prototype.getContext;
  afterEach(() => {
    if (host) host.hook('dispose');
    host = null;
    if (dom) dom.remove();
    HTMLCanvasElement.prototype.getContext = realGetContext;
    MODULES.length = 0;
    delete window.__lfxM4;
    if (spy) spy.mockRestore();
    spy = null;
    vi.useRealTimers();
    delete document.hidden;
  });

  async function build(weather) {
    nowMs = Date.now();
    spy = vi.spyOn(Date, 'now').mockImplementation(() => nowMs);
    MODULES.length = 0;
    MODULES.push(precip, daytime);
    HTMLCanvasElement.prototype.getContext = mkCanvasCtx();
    const layout = buildLayout([{ id: 'new', label: 'Neuheiten', kind: 'new', color: '#f00', itemIds: [] }]);
    dom = document.createElement('div');
    const canvas = document.createElement('canvas');
    dom.appendChild(canvas);
    document.body.appendChild(dom);
    const camera = new PerspectiveCamera();
    camera.position.set(layout.w / 2, 1.65, layout.d + 3);
    const state = { x: layout.w / 2, z: layout.d + 3, yaw: 0, pitch: 0 };
    const app = {
      layout, deps: { weather }, opts: { debug: true }, phone: false, touch: false, sound: false, mode: 'play',
      engine: { scene: new Scene(), camera, renderer: { domElement: canvas, toneMappingExposure: 1 }, preset: { level: 'mid' } },
      player: { x: state.x, z: state.z, y: 0, state, eyeY: () => 1.65 },
      getCarried: () => null, setMode() {}, holdview: { isOpen: false }, findSlot: () => null, take() {}, host: dom,
    };
    host = new ModuleHost(app);
    await host.init();
    return { w: host.providers.get('weather'), pr: host.providers.get('precip') };
  }
  const setHidden = (h) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    document.dispatchEvent(new Event('visibilitychange'));
  };
  /** s Sekunden aktiver Zeit in 1-s-Schritten. */
  const tick = (s, t0 = 0) => { for (let i = 1; i <= s; i++) host.hook('update', 1, t0 + i); };

  it('Tab lange verborgen: beim Sichtbarwerden neu bewerten (>2 h = Rückfall) und sofort neu abrufen', async () => {
    let n = 0;
    const f = vi.fn(() => Promise.resolve(++n === 1 ? real({ k: 'snow', sd: 0.1, t: -3 }) : null));
    const { w } = await build(f);
    await flush();
    expect(w).toMatchObject({ kind: 'snow', real: true });
    setHidden(true);
    nowMs += 3 * 3600 * 1000;
    setHidden(false);
    await flush();
    expect(f).toHaveBeenCalledTimes(2);
    expect(w.real).toBe(false); // 3 h alt und kein neuer Wert: Rückfall
    expect(w.temp).toBeNull();
  });

  it('Tab nur kurz verborgen: kein neuer Abruf', async () => {
    const f = vi.fn(() => Promise.resolve(real({ k: 'rain', i: 0.5 })));
    const { w } = await build(f);
    await flush();
    setHidden(true);
    nowMs += 60 * 1000;
    setHidden(false);
    await flush();
    expect(f).toHaveBeenCalledTimes(1);
    expect(w.kind).toBe('rain');
  });

  it('dispose entfernt den visibilitychange-Listener', async () => {
    const f = vi.fn(() => Promise.resolve(real()));
    await build(f);
    await flush();
    host.hook('dispose');
    host = null;
    nowMs += 3 * 3600 * 1000;
    setHidden(false);
    await flush();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('Abruf ohne Ergebnis: Wiederholung nach ~65 s aktiver Zeit, höchstens 5 in Folge, Erfolg setzt zurück', async () => {
    let ok = false;
    const f = vi.fn(() => Promise.resolve(ok ? real({ k: 'fog', fog: 0.7 }) : null));
    const { w } = await build(f);
    await flush();
    expect(f).toHaveBeenCalledTimes(1);
    tick(60);
    await flush();
    expect(f).toHaveBeenCalledTimes(1); // vor Ablauf kein Versuch
    tick(10, 60);
    await flush();
    expect(f).toHaveBeenCalledTimes(2);
    for (let r = 0; r < 8; r++) { tick(70, 1000 + r * 100); await flush(); } // weitere Versuche; nach 5 Fehlschlägen wieder 15-min-Takt
    expect(f).toHaveBeenCalledTimes(6); // 1 + 5 Wiederholungen
    ok = true;
    tick(900, 5000);
    await flush();
    expect(f).toHaveBeenCalledTimes(7);
    expect(w).toMatchObject({ kind: 'fog', real: true });
    tick(70, 7000); // Erfolg: wieder 15-min-Takt, keine 65-s-Wiederholung
    await flush();
    expect(f).toHaveBeenCalledTimes(7);
  });

  it('Geräteuhr geht vor: Alter wird ab Empfang gemessen, nicht am Server-Zeitstempel', async () => {
    const { w } = await build(() => Promise.resolve(real({ k: 'rain', i: 0.5, ts: Date.now() - 5 * 3600 * 1000 })));
    await flush();
    expect(w).toMatchObject({ kind: 'rain', real: true });
  });

  it('als veraltet gemeldeter Wert behält sein Alter (stale + sehr alter ts: Rückfall)', async () => {
    const { w } = await build(() => Promise.resolve(real({ k: 'rain', i: 0.5, stale: 1, ts: Date.now() - 5 * 3600 * 1000 })));
    await flush();
    expect(w.real).toBe(false);
  });

  it('langsame erste Antwort (> 1,5 s): weiter trocken statt Mehrspieler-Regen, dann echt', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let res;
    const { w } = await build(() => new Promise((r) => { res = r; }));
    w.setRaining(true);
    await vi.advanceTimersByTimeAsync(4000);
    expect(w.raining).toBe(false);
    expect(w.real).toBe(false);
    res(real({ k: 'clear' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(w).toMatchObject({ kind: 'clear', real: true, raining: false });
  });

  it('hängt die Quelle ganz, gilt nach der Sicherungsfrist der Rückfall (Mehrspieler)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { w } = await build(() => new Promise(() => {}));
    w.setRaining(true);
    await vi.advanceTimersByTimeAsync(7000);
    expect(w.raining).toBe(false);
    await vi.advanceTimersByTimeAsync(1500);
    expect(w.raining).toBe(true);
  });

  it('Antwort null nach langer Wartezeit: sofort Rückfall auf Mehrspieler', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let res;
    const { w } = await build(() => new Promise((r) => { res = r; }));
    w.setRaining(true);
    await vi.advanceTimersByTimeAsync(3000);
    expect(w.raining).toBe(false);
    res(null);
    await vi.advanceTimersByTimeAsync(0);
    expect(w.raining).toBe(true);
  });

  it('erster echter Wert nach der Wartezeit gilt in precip sofort (snap), kein 15-s-Einblenden', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let res;
    const { pr } = await build(() => new Promise((r) => { res = r; }));
    await vi.advanceTimersByTimeAsync(3000);
    res(real({ k: 'heavy', i: 1 }));
    await vi.advanceTimersByTimeAsync(0);
    const c = pr.current();
    expect(c.want.kind).toBe('rain');
    expect(c.kind).toBe('rain');
    expect(c.a).toBeGreaterThan(0.9);
  });

  it('temperaturlose Antwort (t:null): Temperatur unbekannt', async () => {
    const { w } = await build(() => Promise.resolve(real({ k: 'clear', t: null })));
    await flush();
    expect(w).toMatchObject({ real: true, temp: null });
  });

  it('N1: hängender Abruf: pending endet nach 8 s, nach 15 s ist ein neuer Abruf möglich, späte Antwort wird verworfen', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const resolvers = [];
    const f = vi.fn(() => new Promise((r) => { resolvers.push(r); }));
    const { w } = await build(f);
    w.setRaining(true);
    await vi.advanceTimersByTimeAsync(8500);
    expect(w.raining).toBe(true); // pending vorbei, obwohl fetching noch hängt
    tick(70);
    expect(f).toHaveBeenCalledTimes(1); // fetching noch gesperrt
    await vi.advanceTimersByTimeAsync(7000); // Sicherung (15 s) gegriffen
    tick(70, 100);
    expect(f).toHaveBeenCalledTimes(2);
    resolvers[0](real({ k: 'snow', sd: 0.1, t: -3 })); // späte Antwort des ersten Abrufs
    await vi.advanceTimersByTimeAsync(0);
    expect(w.real).toBe(false);
    resolvers[1](real({ k: 'fog', fog: 0.7 }));
    await vi.advanceTimersByTimeAsync(0);
    expect(w).toMatchObject({ kind: 'fog', real: true });
  });
});
