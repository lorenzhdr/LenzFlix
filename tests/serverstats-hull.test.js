// @vitest-environment jsdom
// Hülle der Server-Statistik im Geheimmenü (features/secretmenu/serverstats.js): Probe, Laden, deps, Aufräumen. Kein Netzwerk.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const m = vi.hoisted(() => ({
  base: 'https://charts.example.test',
  token: 'tok-secret-123',
  ensureCss: null,
  ensureJs: null,
  removeCss: null,
  openModal: null,
}));
vi.mock('../src/js/core/theme.js', () => ({ isTheme: () => true, getTheme: () => 'flix', onThemeChange: () => () => {} }));
vi.mock('../src/js/core/api.js', () => ({
  isReady: () => true,
  getUserId: () => 'u1',
  setImageScale: () => {},
  getAuth: () => ({ token: m.token }),
  imageUrlFor: (id, o) => `https://jf.example.test/Items/${id}/Images/${o.type}?w=${o.maxWidth}&tag=${o.tag}`,
}));
vi.mock('../src/js/core/charts.js', () => ({ getChartsUrl: () => m.base }));
vi.mock('../src/js/core/addoncss.js', () => ({
  ensureAddonCss: (...a) => m.ensureCss(...a),
  removeAddonCss: (...a) => m.removeCss(...a),
}));
vi.mock('../src/js/core/themejs.js', () => ({ ensureThemeJs: (...a) => m.ensureJs(...a) }));
vi.mock('../src/js/features/modal.js', () => ({ openModal: (...a) => m.openModal(...a) }));

import { openSecretMenu, closeSecretMenu, isSecretMenuOpen, popView } from '../src/js/features/secretmenu/panel.js';
import { clearServerProbeCache } from '../src/js/features/secretmenu/serverstats.js';

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const jsonRes = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const probeOk = { v: 1, tabs: ['now', 'month', 'server'], maxM: 11 };
const srvBtn = () => [...document.querySelectorAll('.lfx-secret__btn')].find((b) => b.textContent === 'Server-Statistik');
const host = () => document.querySelector('.lfx-srv-host');
let fetchMock;

function fakeGlobal(extra = {}) {
  const dispose = vi.fn();
  const el = document.createElement('div');
  el.className = 'fake-ui';
  const create = vi.fn(() => ({ el, dispose }));
  window.LenzFlixServerStats = { version: 1, mark: '__LFX_SRVSTATS_UI__', create, ...extra };
  return { create, dispose, el };
}

describe('Server-Statistik: Hülle', () => {
  beforeEach(() => {
    m.base = 'https://charts.example.test';
    m.token = 'tok-secret-123';
    m.ensureCss = vi.fn(() => Promise.resolve(true));
    m.ensureJs = vi.fn(() => Promise.resolve(true));
    m.removeCss = vi.fn();
    m.openModal = vi.fn();
    fetchMock = vi.fn(async () => jsonRes(probeOk));
    vi.stubGlobal('fetch', fetchMock);
    clearServerProbeCache();
    delete window.LenzFlixServerStats;
  });
  afterEach(() => {
    closeSecretMenu();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete window.LenzFlixServerStats;
    document.body.innerHTML = '';
  });

  describe('Probe', () => {
    it('Erfolg: Abschnitt und Knopf sichtbar, Token nur als Header', async () => {
      openSecretMenu();
      expect(srvBtn().hidden).toBe(true);
      await flush();
      expect(srvBtn().hidden).toBe(false);
      expect(srvBtn().closest('section').hidden).toBe(false);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://charts.example.test/srv');
      expect(String(url)).not.toContain(m.token);
      expect(init.headers['X-Emby-Token']).toBe(m.token);
      expect(init.credentials).toBe('omit');
      expect(init.cache).toBe('no-store');
    });

    it('Fehlerstatus, Netzfehler und ungültige Antwort: Knopf bleibt verborgen', async () => {
      for (const impl of [
        async () => jsonRes({ error: 'x' }, 404),
        async () => { throw new TypeError('offline'); },
        async () => jsonRes({ v: 2, tabs: ['now'] }),
        async () => jsonRes({ v: 1, tabs: [] }),
      ]) {
        clearServerProbeCache();
        fetchMock.mockImplementation(impl);
        openSecretMenu();
        await flush();
        expect(srvBtn().hidden).toBe(true);
        closeSecretMenu();
      }
    });

    it('ohne Token oder ohne Charts-Adresse: kein Abruf, Knopf verborgen', async () => {
      m.token = '';
      openSecretMenu();
      await flush();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(srvBtn().hidden).toBe(true);
      closeSecretMenu();
      m.token = 'tok-secret-123';
      m.base = null;
      openSecretMenu();
      await flush();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(srvBtn().hidden).toBe(true);
    });

    it('Timeout nach 4 s lässt den Knopf verborgen', async () => {
      vi.useFakeTimers();
      fetchMock.mockImplementation((url, init) => new Promise((_, rej) => {
        init.signal.addEventListener('abort', () => rej(new DOMException('abort', 'AbortError')));
      }));
      openSecretMenu();
      await vi.advanceTimersByTimeAsync(4100);
      expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
      expect(srvBtn().hidden).toBe(true);
    });

    it('Ergebnis wird 60 s je Token gemerkt', async () => {
      vi.useFakeTimers();
      openSecretMenu();
      await vi.advanceTimersByTimeAsync(10);
      closeSecretMenu();
      vi.advanceTimersByTime(30000);
      openSecretMenu();
      await vi.advanceTimersByTimeAsync(10);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(srvBtn().hidden).toBe(false);
      closeSecretMenu();
      m.token = 'anderes-token';
      openSecretMenu();
      await vi.advanceTimersByTimeAsync(10);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      closeSecretMenu();
      vi.advanceTimersByTime(61000);
      m.token = 'tok-secret-123';
      openSecretMenu();
      await vi.advanceTimersByTimeAsync(10);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('Schließen bricht die laufende Probe ab', async () => {
      fetchMock.mockImplementation((url, init) => new Promise((_, rej) => {
        init.signal.addEventListener('abort', () => rej(new DOMException('abort', 'AbortError')));
      }));
      openSecretMenu();
      await flush();
      const { signal } = fetchMock.mock.calls[0][1];
      expect(signal.aborted).toBe(false);
      closeSecretMenu();
      expect(signal.aborted).toBe(true);
    });
  });

  describe('Laden', () => {
    it('Erfolg: Ansicht mit Titel, create(deps), dispose beim Pop', async () => {
      const g = fakeGlobal();
      openSecretMenu();
      await flush();
      srvBtn().click();
      expect(document.querySelector('.lfx-secret__title').textContent).toBe('Server-Statistik');
      expect(host()).not.toBeNull();
      await flush();
      expect(m.ensureCss).toHaveBeenCalledWith('lenzserverstats');
      expect(m.ensureJs).toHaveBeenCalledWith('serverstats');
      expect(g.create).toHaveBeenCalledTimes(1);
      expect(host().firstChild).toBe(g.el);
      const deps = g.create.mock.calls[0][0];
      expect(deps.tabs).toEqual(['now', 'month', 'server']);
      expect(deps.maxM).toBe(11);
      expect(g.dispose).not.toHaveBeenCalled();
      popView();
      expect(g.dispose).toHaveBeenCalledTimes(1);
      expect(isSecretMenuOpen()).toBe(true);
      expect(document.activeElement).toBe(srvBtn());
    });

    it('dispose auch beim Schließen des Menüs, dazu removeAddonCss', async () => {
      const g = fakeGlobal();
      openSecretMenu();
      await flush();
      srvBtn().click();
      await flush();
      closeSecretMenu();
      expect(g.dispose).toHaveBeenCalledTimes(1);
      expect(m.removeCss).toHaveBeenCalledWith('lenzserverstats');
    });

    it('Pop vor Abschluss des Ladens: keine Instanz mehr', async () => {
      const g = fakeGlobal();
      let release;
      m.ensureJs = vi.fn(() => new Promise((r) => { release = r; }));
      openSecretMenu();
      await flush();
      srvBtn().click();
      popView();
      release(true);
      await flush();
      expect(g.create).not.toHaveBeenCalled();
    });

    it('Laden scheitert: Hinweis und „Erneut versuchen“, danach Erfolg', async () => {
      const g = fakeGlobal();
      m.ensureJs = vi.fn(() => Promise.resolve(false));
      openSecretMenu();
      await flush();
      srvBtn().click();
      await flush();
      expect(host().textContent).toContain('Konnte nicht geladen werden.');
      const retry = [...host().querySelectorAll('button')].find((b) => b.textContent === 'Erneut versuchen');
      expect(retry).toBeTruthy();
      expect(g.create).not.toHaveBeenCalled();
      m.ensureJs = vi.fn(() => Promise.resolve(true));
      retry.click();
      await flush();
      expect(g.create).toHaveBeenCalledTimes(1);
      expect(host().firstChild).toBe(g.el);
    });

    it('fehlendes oder falsches Global (version) zählt als Fehler', async () => {
      openSecretMenu();
      await flush();
      srvBtn().click();
      await flush();
      expect(host().textContent).toContain('Konnte nicht geladen werden.');
      popView();
      const g = fakeGlobal({ version: 2 });
      srvBtn().click();
      await flush();
      expect(g.create).not.toHaveBeenCalled();
      expect(host().textContent).toContain('Erneut versuchen');
    });

    it('create wirft: Fehlerzustand statt Absturz', async () => {
      fakeGlobal({ create: () => { throw new Error('kaputt'); } });
      openSecretMenu();
      await flush();
      srvBtn().click();
      await flush();
      expect(host().textContent).toContain('Konnte nicht geladen werden.');
    });
  });

  describe('deps', () => {
    async function getDeps() {
      const g = fakeGlobal();
      openSecretMenu();
      await flush();
      srvBtn().click();
      await flush();
      return g.create.mock.calls[0][0];
    }

    it('get: Basis-URL, Header, Token nie in der URL, Daten und Status', async () => {
      const deps = await getDeps();
      fetchMock.mockClear();
      fetchMock.mockImplementation(async () => jsonRes({ v: 1, n: 2 }));
      const r = await deps.get('/srv/month?m=3', {});
      expect(r).toEqual({ ok: true, status: 200, data: { v: 1, n: 2 } });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://charts.example.test/srv/month?m=3');
      expect(url).not.toContain(m.token);
      expect(init.headers['X-Emby-Token']).toBe(m.token);
      expect(init.credentials).toBe('omit');
      expect(init.cache).toBe('no-store');
    });

    it('get: HTTP-Fehler liefert status ohne Daten, Netzfehler status 0, wirft nie', async () => {
      const deps = await getDeps();
      fetchMock.mockImplementation(async () => jsonRes({}, 503));
      expect(await deps.get('/srv/now', {})).toEqual({ ok: false, status: 503 });
      fetchMock.mockImplementation(async () => { throw new TypeError('offline'); });
      expect(await deps.get('/srv/now', {})).toEqual({ ok: false, status: 0 });
      fetchMock.mockImplementation(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('x'); } }));
      expect(await deps.get('/srv/now')).toEqual({ ok: false, status: 0 });
    });

    it('get: Timeout nach 8 s und Abbruch per signal ergeben status 0', async () => {
      const deps = await getDeps();
      vi.useFakeTimers();
      fetchMock.mockImplementation((url, init) => new Promise((_, rej) => {
        init.signal.addEventListener('abort', () => rej(new DOMException('abort', 'AbortError')));
      }));
      const p = deps.get('/srv/now', {});
      await vi.advanceTimersByTimeAsync(7900);
      let settled = false;
      p.then(() => { settled = true; });
      await Promise.resolve();
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(200);
      expect(await p).toEqual({ ok: false, status: 0 });
      const ctl = new AbortController();
      const q = deps.get('/srv/now', { signal: ctl.signal });
      ctl.abort();
      expect(await q).toEqual({ ok: false, status: 0 });
      expect(await deps.get('/srv/now', { signal: ctl.signal })).toEqual({ ok: false, status: 0 });
    });

    it('get: ohne Token kein Abruf', async () => {
      const deps = await getDeps();
      fetchMock.mockClear();
      m.token = '';
      expect(await deps.get('/srv/now', {})).toEqual({ ok: false, status: 0 });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('img: über imageUrlFor ohne api_key, null ohne id oder tag', async () => {
      const deps = await getDeps();
      const u = deps.img('abc', 'tg', 120);
      expect(u).toContain('/Items/abc/Images/Primary');
      expect(u).toContain('tag=tg');
      expect(u).not.toContain('api_key');
      expect(deps.img('', 'tg', 1)).toBeNull();
      expect(deps.img('abc', '', 1)).toBeNull();
    });

    it('openItem: Menü schließt, dann openModal(id)', async () => {
      const deps = await getDeps();
      m.openModal = vi.fn(() => { expect(isSecretMenuOpen()).toBe(false); });
      deps.openItem('item-1');
      expect(isSecretMenuOpen()).toBe(false);
      expect(m.openModal).toHaveBeenCalledWith('item-1');
    });
  });

  it('Hüllen-Quelltext enthält weder Marker des Bundles noch das Wort für das 3D-Paket', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve('src/js/features/secretmenu/serverstats.js'), 'utf8');
    expect(src).not.toContain('__LFX_SRVSTATS_UI__');
    expect(/\bthree\b/i.test(src)).toBe(false);
  });
});
