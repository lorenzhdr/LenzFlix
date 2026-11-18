// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const st = vi.hoisted(() => ({ base: 'https://charts.test', token: 'tok' }));
vi.mock('../src/js/core/api.js', () => ({ getAuth: () => ({ token: st.token }) }));
vi.mock('../src/js/core/charts.js', () => ({ getChartsUrl: () => st.base }));

import { fetchOnline, clearOnlineCache } from '../src/js/core/online.js';

const ok = (body, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe('fetchOnline', () => {
  beforeEach(() => {
    clearOnlineCache();
    st.base = 'https://charts.test';
    st.token = 'tok';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('liefert die Zahl, sendet Token nur als Header, credentials omit', async () => {
    const f = ok({ v: 1, n: 4 });
    vi.stubGlobal('fetch', f);
    expect(await fetchOnline()).toBe(4);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://charts.test/mp/online');
    expect(url).not.toContain('tok');
    expect(init.headers['X-Emby-Token']).toBe('tok');
    expect(init.credentials).toBe('omit');
  });

  it('Modul-Cache 20 s, danach neuer Abruf', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const f = ok({ v: 1, n: 2 });
    vi.stubGlobal('fetch', f);
    await fetchOnline();
    vi.setSystemTime(15000);
    expect(await fetchOnline()).toBe(2);
    expect(f).toHaveBeenCalledTimes(1);
    vi.setSystemTime(22000);
    await fetchOnline();
    expect(f).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['404', () => ok({}, 404)],
    ['503', () => ok({}, 503)],
    ['falsches Schema', () => ok({ v: 2, n: 3 })],
    ['n keine Ganzzahl', () => ok({ v: 1, n: 1.5 })],
    ['n negativ', () => ok({ v: 1, n: -1 })],
    ['Netzfehler', () => vi.fn(async () => { throw new TypeError('x'); })],
  ])('null bei %s, kein Cache', async (_n, mk) => {
    vi.stubGlobal('fetch', mk());
    expect(await fetchOnline()).toBeNull();
    const f = ok({ v: 1, n: 1 });
    vi.stubGlobal('fetch', f);
    expect(await fetchOnline()).toBe(1);
  });

  it('null ohne Charts-URL oder Token, ohne Netzaufruf', async () => {
    const f = ok({ v: 1, n: 1 });
    vi.stubGlobal('fetch', f);
    st.base = '';
    expect(await fetchOnline()).toBeNull();
    st.base = 'https://charts.test';
    st.token = '';
    expect(await fetchOnline()).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it('null bei Abbruch von außen', async () => {
    vi.stubGlobal('fetch', vi.fn((u, init) => new Promise((_r, rej) => init.signal.addEventListener('abort', () => rej(new DOMException('a', 'AbortError'))))));
    const ctl = new AbortController();
    const p = fetchOnline(ctl.signal);
    ctl.abort();
    expect(await p).toBeNull();
  });

  it('Timeout nach 4 s', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((u, init) => new Promise((_r, rej) => init.signal.addEventListener('abort', () => rej(new DOMException('a', 'AbortError'))))));
    const p = fetchOnline();
    await vi.advanceTimersByTimeAsync(4100);
    expect(await p).toBeNull();
  });
});
