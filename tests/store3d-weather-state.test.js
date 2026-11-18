// @vitest-environment jsdom
// VIDEOTHEK LENZ · Wetterzustand (1.19.0): Vorrangkette, Ableitungen, Winter-Hysterese; Modul daytime mit echtem Wetter (Fake-deps.weather, kein Netzwerk).
import { describe, it, expect, afterEach } from 'vitest';
import { Scene, PerspectiveCamera } from 'three';
import { resolveWeather, coverFromDepth, precipIntensity, winterNext, RAINY } from '../src/js/store3d/weather/state.js';
import { skyPalette } from '../src/js/store3d/modules/m4-util.js';
import { fogTarget } from '../src/js/store3d/modules/city.js';
import { MODULES } from '../src/js/store3d/modules/index.js';
import { ModuleHost } from '../src/js/store3d/modules/runtime.js';
import precip from '../src/js/store3d/modules/precip.js';
import daytime from '../src/js/store3d/modules/daytime.js';
import { buildLayout } from '../src/js/store3d/world/layout.js';

const real = (o) => ({ k: 'clear', i: 0, sd: 0, fog: 0, t: 8, day: 1, ts: 1, stale: 0, ...o });

describe('resolveWeather: Vorrang Debug > echt > Mehrspieler > lokal', () => {
  it('lokal: Zufallsregen bzw. klar, nie echt', () => {
    const a = resolveWeather({ local: true });
    expect(a).toMatchObject({ kind: 'rain', raining: true, wet: true, real: false, temp: null, src: 'local' });
    expect(resolveWeather({ local: false })).toMatchObject({ kind: 'clear', raining: false, wet: false, overcast: false });
  });
  it('Mehrspieler schlägt lokal', () => {
    expect(resolveWeather({ mp: false, local: true }).raining).toBe(false);
    expect(resolveWeather({ mp: true, local: false })).toMatchObject({ raining: true, src: 'mp' });
  });
  it('echtes Wetter schlägt Mehrspieler und lokal (MP-Regen wird ignoriert)', () => {
    const s = resolveWeather({ real: real({ k: 'clear' }), mp: true, local: true });
    expect(s).toMatchObject({ kind: 'clear', raining: false, real: true, src: 'real', temp: 8 });
    expect(resolveWeather({ real: real({ k: 'snow', i: 0.5 }), mp: false, local: false })).toMatchObject({ snowing: true, wet: true, raining: false });
  });
  it('Debug schlägt echtes Wetter', () => {
    const s = resolveWeather({ debug: { kind: 'storm' }, real: real({ k: 'clear' }), mp: false, local: false });
    expect(s).toMatchObject({ kind: 'storm', storm: true, raining: true, src: 'debug' });
    expect(resolveWeather({ debug: { temp: -4 }, real: real({ k: 'rain' }) })).toMatchObject({ kind: 'clear', temp: -4 });
  });
  it('leerer Debug-Wert wird ignoriert', () => {
    expect(resolveWeather({ debug: {}, real: real({ k: 'rain' }) }).src).toBe('real');
    expect(resolveWeather({ debug: null, real: null, mp: null, local: false }).src).toBe('local');
  });
});

describe('Ableitungen', () => {
  it('Regenarten und Stärken', () => {
    expect(RAINY).toEqual(['drizzle', 'rain', 'heavy', 'storm']);
    expect(precipIntensity('drizzle')).toBeCloseTo(0.3);
    expect(precipIntensity('rain')).toBeCloseTo(0.6);
    expect(precipIntensity('heavy')).toBe(1);
    expect(precipIntensity('storm')).toBeCloseTo(0.9);
    expect(precipIntensity('snow', 0)).toBeCloseTo(0.3);
    expect(precipIntensity('snow', 1)).toBeCloseTo(1);
    expect(precipIntensity('clear', 1)).toBe(0);
  });
  it('Schneebedeckung aus der Höhe: 0 ohne, dünn ab 0,02 m, voll ab 0,15 m', () => {
    expect(coverFromDepth(0)).toBe(0);
    expect(coverFromDepth(-1)).toBe(0);
    expect(coverFromDepth(0.02)).toBeCloseTo(0.2);
    expect(coverFromDepth(0.085)).toBeGreaterThan(0.2);
    expect(coverFromDepth(0.085)).toBeLessThan(1);
    expect(coverFromDepth(0.15)).toBeCloseTo(1);
    expect(coverFromDepth(2)).toBe(1);
  });
  it('liegender Schnee ohne Schneefall (klar, sd > 0)', () => {
    const s = resolveWeather({ real: real({ k: 'clear', sd: 0.1 }) });
    expect(s.snowing).toBe(false);
    expect(s.wet).toBe(false);
    expect(s.cover).toBeGreaterThan(0.5);
  });
  it('Nebel und bedeckt', () => {
    expect(resolveWeather({ real: real({ k: 'fog', fog: 0.2 }) })).toMatchObject({ fog: 0.5, overcast: true });
    expect(resolveWeather({ real: real({ k: 'fog', fog: 0.9 }) }).fog).toBeCloseTo(0.9);
    expect(resolveWeather({ real: real({ k: 'cloudy' }) })).toMatchObject({ overcast: true, wet: false, fog: 0 });
    expect(resolveWeather({ real: real({ k: 'rain', t: 3.6 }) }).temp).toBe(4);
  });
  it('Debug: Schnee ohne cover = 0,5; ?sd rechnet um', () => {
    expect(resolveWeather({ debug: { kind: 'snow' } }).cover).toBe(0.5);
    expect(resolveWeather({ debug: { kind: 'snow', cover: 1 } }).cover).toBe(1);
    expect(resolveWeather({ debug: { sd: 0.15 } }).cover).toBeCloseTo(1);
  });
});

describe('Winter-Hysterese', () => {
  it('an bei <= 3, aus bei >= 6, dazwischen bleibt der Zustand', () => {
    let w = false;
    w = winterNext(w, 5); expect(w).toBe(false);
    w = winterNext(w, 3); expect(w).toBe(true);
    w = winterNext(w, 5); expect(w).toBe(true);
    w = winterNext(w, 5.9); expect(w).toBe(true);
    w = winterNext(w, 6); expect(w).toBe(false);
    w = winterNext(w, 4); expect(w).toBe(false);
    expect(winterNext(true, null)).toBe(false);
  });
});

describe('skyPalette und Nebel (rein)', () => {
  it('ohne dritten Parameter unverändert, mit Nebel/Schnee heller-grauer', () => {
    const base = skyPalette('day', false);
    expect(skyPalette('day', false, undefined)).toEqual(base);
    expect(skyPalette('day', false, { overcast: false, fog: 0, snow: false })).toEqual(base);
    const fog = skyPalette('day', false, { overcast: true, fog: 0.8 });
    expect(fog.rain).toBe(false);
    expect(fog.stars).toBe(0);
    const spread = (c) => Math.max(...c) - Math.min(...c);
    expect(spread(fog.sky[0])).toBeLessThan(spread(base.sky[0]));
    expect(skyPalette('day', true, { fog: 0.5 })).toEqual(skyPalette('day', true));
  });
  it('fogTarget: draußen enger bei Nebel, drinnen und ohne Nebel wie bisher, nie weiter als die Basis', () => {
    const base = { near: 34, far: 56 };
    expect(fogTarget(base, 0, false)).toEqual(base);
    expect(fogTarget(base, 1, true)).toEqual(base);
    expect(fogTarget(base, 1, false)).toEqual({ near: 6, far: 22 });
    const half = fogTarget(base, 0.5, false);
    expect(half.near).toBeCloseTo(13);
    expect(half.far).toBeCloseTo(40);
    expect(fogTarget({ near: 10, far: 30 }, 0.1, false).near).toBeLessThanOrEqual(10);
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

describe('daytime mit echtem Wetter (Fake-deps.weather)', () => {
  let host;
  let dom;
  const realGetContext = HTMLCanvasElement.prototype.getContext;
  afterEach(() => {
    if (host) host.hook('dispose');
    host = null;
    if (dom) dom.remove();
    HTMLCanvasElement.prototype.getContext = realGetContext;
    MODULES.length = 0;
    delete window.__lfxM4;
  });

  async function build({ weather, opts = {} } = {}) {
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
      layout, deps: weather ? { weather } : {}, opts: { debug: true, ...opts }, phone: false, touch: false, sound: false, mode: 'play',
      engine: { scene: new Scene(), camera, renderer: { domElement: canvas, toneMappingExposure: 1 }, preset: { level: 'mid' } },
      player: { x: state.x, z: state.z, y: 0, state, eyeY: () => 1.65 },
      getCarried: () => null, setMode() {}, holdview: { isOpen: false }, findSlot: () => null, take() {}, host: dom,
    };
    host = new ModuleHost(app);
    await host.init();
    return { w: host.providers.get('weather'), pr: host.providers.get('precip') };
  }
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('echter Schnee: Provider-Felder, precip bekommt snow, Mehrspieler-Regen wird ignoriert', async () => {
    const { w, pr } = await build({ weather: () => Promise.resolve(real({ k: 'snow', i: 0.5, sd: 0.1, t: -2 })) });
    await flush();
    expect(w).toMatchObject({ kind: 'snow', snowing: true, wet: true, raining: false, real: true, temp: -2 });
    expect(w.cover).toBeGreaterThan(0.5);
    expect(w.precip.kind).toBe('snow');
    expect(pr.current().want.kind).toBe('snow');
    w.setRaining(true);
    expect(w.raining).toBe(false);
    expect(w.kind).toBe('snow');
  });

  it('onChange feuert bei jeder Änderung, nicht bei gleichem Zustand', async () => {
    let v = real({ k: 'clear' });
    const { w } = await build({ weather: () => Promise.resolve(v) });
    await flush();
    const calls = [];
    w.onChange((x) => calls.push(x.kind));
    w.setRaining(false); // echtes Wetter: keine Änderung
    expect(calls).toEqual([]);
    v = real({ k: 'rain' });
    host.hook('onSuspend');
    host.hook('onResume'); // jünger als 15 min: kein neuer Abruf
    expect(calls).toEqual([]);
  });

  it('Rückfall: Quelle liefert null → lokaler Zufall/Mehrspieler wie bisher', async () => {
    const { w } = await build({ weather: () => Promise.resolve(null) });
    await flush();
    expect(w.real).toBe(false);
    expect(w.temp).toBeNull();
    const base = w.raining;
    w.setRaining(!base);
    expect(w.raining).toBe(!base);
    w.setRaining(null);
    expect(w.raining).toBe(base);
  });

  it('Fehler der Quelle (Reject) fällt auf lokalen Zufall zurück', async () => {
    const { w } = await build({ weather: () => Promise.reject(new Error('x')) });
    await flush();
    expect(w.real).toBe(false);
  });

  it('während des Wartens kein Zufallsregen (pending), danach lokal', async () => {
    let res;
    const { w } = await build({ weather: () => new Promise((r) => { res = r; }) });
    expect(w.raining).toBe(false);
    expect(w.real).toBe(false);
    res(real({ k: 'heavy', t: 7 }));
    await flush();
    expect(w).toMatchObject({ kind: 'heavy', raining: true, real: true });
    expect(w.precip).toEqual({ kind: 'rain', i: 1 });
  });

  it('Debug-Wetter (?wx) hat Vorrang vor echtem Wetter und ruft die Quelle nicht ab', async () => {
    let calls = 0;
    const { w } = await build({ weather: () => { calls++; return Promise.resolve(real({ k: 'rain' })); }, opts: { dev: { wx: 'fog', temp: '-4' } } });
    await flush();
    expect(calls).toBe(0);
    expect(w).toMatchObject({ kind: 'fog', temp: -4, real: true });
    expect(w.fog).toBeGreaterThan(0.5);
  });

  it('?rain=1 (Altparameter) bleibt Regen ohne echtes Wetter, ohne Thermometer', async () => {
    const { w } = await build({ opts: { rain: true } });
    expect(w).toMatchObject({ raining: true, real: false, temp: null });
  });
});
