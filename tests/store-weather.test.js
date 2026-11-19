// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const auth = vi.hoisted(() => ({ cur: { token: 'TOK', userId: 'u1' } }));
vi.mock('../src/js/core/api.js', () => ({ getAuth: () => auth.cur, getUserId: () => auth.cur.userId }));

import { createWeatherSource } from '../src/js/features/store/weather.js';

const good = { v: 1, k: 'snow', i: 0.65, sd: 0.2, fog: 0.1, t: -3, day: 1, ts: 1000 };
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => { if (body === undefined) throw new SyntaxError('x'); return body; } });

beforeEach(() => {
  auth.cur = { token: 'TOK', userId: 'u1' };
  window.LenzFlixConfig = { chartsUrl: 'https://charts.example.test/' };
});
afterEach(() => {
  delete window.LenzFlixConfig;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('createWeatherSource()', () => {
  it('200 gültig: Daten, Header, credentials omit, Token nie in der URL', async () => {
    const f = vi.fn(async () => reply(200, { ...good, stale: 1 }));
    vi.stubGlobal('fetch', f);
    expect(await createWeatherSource()()).toEqual({ k: "snow", i: 0.65, sd: 0.2, fog: 0.1, t: -3, day: 1, ts: 1000, stale: 1 });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://charts.example.test/wx');
    expect(init.headers).toEqual({ 'X-Emby-Token': 'TOK' });
    expect(init.credentials).toBe('omit');
    expect(url).not.toContain('TOK');
  });
  it('fehlendes stale wird 0', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(200, good)));
    expect((await createWeatherSource()()).stale).toBe(0);
  });
  it('404, 503, Netzfehler: null', async () => {
    for (const f of [vi.fn(async () => reply(404, {})), vi.fn(async () => reply(503, {})), vi.fn(async () => { throw new TypeError('net'); })]) {
      vi.stubGlobal('fetch', f);
      expect(await createWeatherSource()()).toBeNull();
    }
  });
  it('Schema kaputt: null', async () => {
    for (const body of [{ ...good, v: 2 }, { ...good, k: 'hail' }, { ...good, t: 'x' }, { ...good, sd: Infinity }, null, undefined]) {
      vi.stubGlobal('fetch', vi.fn(async () => reply(200, body)));
      expect(await createWeatherSource()()).toBeNull();
    }
  });
  it('Timeout: Abbruch nach 6 s gibt null', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' }))))));
    const p = createWeatherSource()();
    await vi.advanceTimersByTimeAsync(6001);
    expect(await p).toBeNull();
  });
  it('TTL: 15 min Erfolg, 5 min nach 404', async () => {
    vi.useFakeTimers();
    const f = vi.fn(async () => reply(200, good));
    vi.stubGlobal('fetch', f);
    const src = createWeatherSource();
    await src();
    await vi.advanceTimersByTimeAsync(13 * 60 * 1000);
    await src();
    expect(f).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(61 * 1000);
    await src();
    expect(f).toHaveBeenCalledTimes(2);

    const g = vi.fn(async () => reply(404, {}));
    vi.stubGlobal('fetch', g);
    const s2 = createWeatherSource();
    await s2();
    await vi.advanceTimersByTimeAsync(4 * 60 * 1000);
    await s2();
    expect(g).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(61 * 1000);
    await s2();
    expect(g).toHaveBeenCalledTimes(2);
  });
  it('Timeout/Netzfehler/503: nur 60 s gemerkt', async () => {
    vi.useFakeTimers();
    const f = vi.fn(async () => { throw new TypeError('net'); });
    vi.stubGlobal('fetch', f);
    const src = createWeatherSource();
    await src();
    await vi.advanceTimersByTimeAsync(30 * 1000);
    await src();
    expect(f).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(31 * 1000);
    await src();
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('Cache an das Token gebunden: Kontowechsel verwirft Treffer und Fehlschlag', async () => {
    const f = vi.fn(async () => reply(404, {}));
    vi.stubGlobal('fetch', f);
    const src = createWeatherSource();
    expect(await src()).toBeNull();
    await src();
    expect(f).toHaveBeenCalledTimes(1);
    auth.cur = { token: 'TOK2', userId: 'u2' };
    f.mockImplementation(async () => reply(200, good));
    expect((await src()).k).toBe('snow');
    expect(f).toHaveBeenCalledTimes(2);
    expect(f.mock.calls[1][1].headers['X-Emby-Token']).toBe('TOK2');
    auth.cur = { token: '', userId: '' }; // abgemeldet
    expect(await src()).toBeNull();
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('ohne Charts-URL oder Token: null, kein fetch', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    delete window.LenzFlixConfig;
    expect(await createWeatherSource()()).toBeNull();
    window.LenzFlixConfig = { chartsUrl: 'https://charts.example.test/' };
    auth.cur = { token: '', userId: 'u1' };
    expect(await createWeatherSource()()).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
  it('gleichzeitige Aufrufe: ein fetch', async () => {
    const f = vi.fn(async () => reply(200, good));
    vi.stubGlobal('fetch', f);
    const src = createWeatherSource();
    const [a, b] = await Promise.all([src(), src()]);
    expect(f).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it('t:null oder fehlendes t = Temperatur unbekannt (Antwort bleibt gültig), t:"x" verworfen', async () => {
    for (const t of [null, undefined]) {
      vi.stubGlobal('fetch', vi.fn(async () => reply(200, { ...good, t })));
      expect((await createWeatherSource()()).t).toBeNull();
    }
    vi.stubGlobal('fetch', vi.fn(async () => reply(200, { ...good, t: 'x' })));
    expect(await createWeatherSource()()).toBeNull();
  });
  it('Cache läuft ab Abrufstart und unter dem 3D-Intervall (15 min) ab: der Refresh trifft nie den alten Wert', async () => {
    vi.useFakeTimers();
    const f = vi.fn(() => new Promise((res) => setTimeout(() => res(reply(200, good)), 5000))); // 5 s Latenz
    vi.stubGlobal('fetch', f);
    const src = createWeatherSource();
    const p = src();
    await vi.advanceTimersByTimeAsync(5000);
    await p;
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000 - 5000); // Abrufstart + 15 min = Refresh des 3D-Teils
    const p2 = src();
    await vi.advanceTimersByTimeAsync(5000);
    await p2;
    expect(f).toHaveBeenCalledTimes(2);
  });
});
