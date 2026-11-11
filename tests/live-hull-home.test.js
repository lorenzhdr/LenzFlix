// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const themeState = vi.hoisted(() => ({ listeners: new Set(), prev: 'plus' }));

vi.mock('../src/js/core/theme.js', () => ({
  THEME_META: { flix: { name: 'LENZFLIX' }, plus: { name: 'LENZ+' } },
  getPreviousTheme: vi.fn(() => themeState.prev),
  isTheme: vi.fn((id) => id === 'live'),
  onThemeChange: vi.fn((fn) => {
    themeState.listeners.add(fn);
    return () => themeState.listeners.delete(fn);
  }),
}));
vi.mock('../src/js/core/api.js', async () => {
  const actual = await vi.importActual('../src/js/core/api.js');
  return {
    ...actual,
    isReady: () => true,
    getUserId: () => 'u1',
    getAuth: () => ({ address: 'http://srv', token: 'TOK123', userId: 'u1', serverId: 's1' }),
    getUser: vi.fn(async () => ({
      Id: 'u1', Name: 'Lenz', Policy: { IsAdministrator: true },
      Configuration: { AudioLanguagePreference: 'ger', SubtitleLanguagePreference: 'eng', SubtitleMode: 'OnlyForced' },
    })),
    getItems: vi.fn(async () => ({ Items: [{ Id: 'a' }, { Id: 'b' }] })),
    getItem: vi.fn(async (id) => ({ Id: id, LocalTrailerCount: 1 })),
    setPlayed: vi.fn(async () => {}),
    requestJson: vi.fn(async () => ({ ok: 1 })),
  };
});
vi.mock('../src/js/core/themejs.js', () => ({ ensureThemeJs: vi.fn(async () => true), removeThemeJs: vi.fn() }));
vi.mock('../src/js/core/themepicker.js', () => ({ openThemePicker: vi.fn() }));
vi.mock('../src/js/core/toast.js', () => ({ toast: vi.fn() }));
vi.mock('../src/js/shared/profile.js', () => ({ logout: vi.fn() }));
vi.mock('../src/js/shared/trailer.js', () => ({
  loadLocalTrailer: vi.fn(async () => ({ Id: 'tr1', RunTimeTicks: 1200000000 })),
  trailerUrl: vi.fn((id) => `http://srv/Videos/${id}/stream.mp4?static=true&api_key=TOK123`),
}));
vi.mock('../src/js/features/live/data.js', () => ({ loadCatalog: vi.fn(async () => ({ movies: [], series: [], episodes: [], boxsets: [], loadedAt: 1 })) }));
vi.mock('../src/js/features/live/leave.js', () => ({ leaveToLibrary: vi.fn(async () => true) }));

import feature, { SUSPEND_MS, destroyLive } from '../src/js/features/live/home.js';
import { ensureThemeJs, removeThemeJs } from '../src/js/core/themejs.js';
import { loadCatalog } from '../src/js/features/live/data.js';
import { leaveToLibrary } from '../src/js/features/live/leave.js';
import { openThemePicker } from '../src/js/core/themepicker.js';
import { logout } from '../src/js/shared/profile.js';
import { isTheme } from '../src/js/core/theme.js';
import * as api from '../src/js/core/api.js';

const route = (q = '') => ({ path: '/home', params: new URLSearchParams(q), hash: `/home${q ? `?${q}` : ''}` });
let inst;
let create;
let captured;

function setup() {
  document.body.innerHTML = '<header class="MuiAppBar-root"></header><div id="indexPage"><div id="homeTab"><div class="sections"></div></div></div>';
}

async function mountOk(q = '') {
  feature.mount(route(q));
  await vi.waitFor(() => expect(create).toHaveBeenCalled());
}

beforeEach(() => {
  setup();
  localStorage.clear();
  themeState.listeners.clear();
  themeState.prev = 'plus';
  inst = { suspend: vi.fn(), resume: vi.fn(), dispose: vi.fn(), isOn: vi.fn(() => false) };
  captured = null;
  create = vi.fn((host, deps, opts) => {
    captured = { host, deps, opts };
    return inst;
  });
  window.LenzFlixLive = { version: 1, create };
  window.ApiClient = { deviceId: () => 'dev-1' };
  vi.mocked(isTheme).mockImplementation((id) => id === 'live');
  vi.mocked(ensureThemeJs).mockResolvedValue(true);
  vi.mocked(loadCatalog).mockClear();
  vi.mocked(leaveToLibrary).mockClear();
  vi.mocked(removeThemeJs).mockClear();
  vi.mocked(openThemePicker).mockClear();
  vi.mocked(logout).mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  feature.unmount();
  destroyLive();
  vi.restoreAllMocks();
  delete window.LenzFlixLive;
  delete window.ApiClient;
  delete window.__lfxLiveDebug;
  delete window.LenzFlixConfig;
});

describe('match', () => {
  it('nur im Design live, Modern, passende Route', () => {
    expect(feature.match(route())).toBe(true);
    expect(feature.match(route('lfx=new'))).toBe(false);
    expect(feature.match(route('lfx=title&id=1'))).toBe(false);
    expect(feature.match(route('tab=1'))).toBe(false);
    expect(feature.match({ path: '/movies', params: new URLSearchParams() })).toBe(false);
    vi.mocked(isTheme).mockImplementation(() => false);
    expect(feature.match(route())).toBe(false);
  });
});

describe('mount', () => {
  it('baut Bühne als erstes Kind von #homeTab, zeigt „Sendersuchlauf“ und ruft create() mit deps/opts', async () => {
    window.LenzFlixConfig = { liveChannels: '5=Action' };
    window.matchMedia = vi.fn(() => ({ matches: false }));
    feature.mount(route());
    const tab = document.getElementById('homeTab');
    expect(tab.firstElementChild.id).toBe('lfx-live-home');
    expect(tab.querySelector('.lfx-live-loading__title').textContent).toBe('Sendersuchlauf …');
    expect(tab.querySelector('.lfx-live-loading [role="progressbar"]')).not.toBeNull();
    await vi.waitFor(() => expect(create).toHaveBeenCalled());
    expect(captured.host.classList.contains('lfx-live-stage')).toBe(true);
    expect(tab.firstElementChild.contains(captured.host)).toBe(true);
    expect(document.documentElement.classList.contains('lfx-live-home-on')).toBe(true);
    expect(ensureThemeJs).toHaveBeenCalledWith('live');
    expect(loadCatalog).toHaveBeenCalledTimes(1);
    expect(captured.opts).toEqual({
      style: 'flat', volume: 0.8, muted: false, lastChannel: 1, audioPref: null, phone: false, touch: false, debug: false, now: null, fakePlayer: false,
    });
    for (const k of ['catalog', 'user', 'server', 'request', 'streamUrl', 'imageUrl', 'getBoxSetItems', 'loadTrailer', 'setPlayed', 'channelConfig',
      'savePrefs', 'leaveToLibrary', 'previousThemeName', 'openThemePicker', 'openDashboard', 'logout', 'toast', 'onProgress', 'onReady', 'onFatal']) {
      expect(captured.deps[k]).toBeDefined();
    }
    delete window.matchMedia;
  });

  it('opts aus den Vorlieben, debug über window.__lfxLiveDebug', async () => {
    localStorage.setItem('lfx.live.tvstyle.u1', 'silver');
    localStorage.setItem('lfx.live.volume.u1', '0.3');
    localStorage.setItem('lfx.live.muted.u1', '1');
    localStorage.setItem('lfx.live.lastChannel.u1', '9');
    window.__lfxLiveDebug = true;
    await mountOk();
    expect(captured.opts).toMatchObject({ style: 'silver', volume: 0.3, muted: true, lastChannel: 9, debug: true, now: null, fakePlayer: false });
  });

  it('deps: user, server, channelConfig, previousThemeName', async () => {
    window.LenzFlixConfig = { liveChannels: { 5: 'Action' } };
    await mountOk();
    const d = captured.deps;
    expect(d.user).toEqual({ id: 'u1', name: 'Lenz', isAdmin: true, audioLang: 'ger', subLang: 'eng', subMode: 'OnlyForced' });
    expect(d.server).toEqual({ deviceId: 'dev-1' });
    expect(d.channelConfig).toEqual({ 5: 'Action' });
    expect(d.previousThemeName).toBe('LENZ+');
    expect(d.catalog.loadedAt).toBe(1);
  });

  it('deps: request/streamUrl/imageUrl/getBoxSetItems/loadTrailer/setPlayed/leave/savePrefs', async () => {
    await mountOk();
    const d = captured.deps;
    expect(await d.request('POST', '/Items/x/PlaybackInfo', { body: { a: 1 } })).toEqual({ ok: 1 });
    expect(api.requestJson).toHaveBeenCalledWith('POST', '/Items/x/PlaybackInfo', { body: { a: 1 } });

    const su = d.streamUrl('/Videos/x/stream', { static: true, MediaSourceId: 'm' });
    expect(su).toContain('/Videos/x/stream?');
    expect(su).toContain('static=true');
    expect(su).toContain('MediaSourceId=m');
    expect(su).toContain('ApiKey=TOK123');
    expect(su).not.toContain('api_key');

    const iu = d.imageUrl('abc', { type: 'Primary', maxWidth: 300, tag: 't1' });
    expect(iu).toContain('/Items/abc/Images/Primary');
    expect(iu).toContain('maxWidth=300');
    expect(iu).not.toMatch(/api_key|ApiKey|TOK123/i);

    expect(await d.getBoxSetItems('bs1')).toEqual(['a', 'b']);
    expect(api.getItems).toHaveBeenCalledWith({ ParentId: 'bs1', Fields: '', EnableImages: false, EnableUserData: false });

    expect(await d.loadTrailer('m1')).toEqual({ url: expect.stringContaining('/Videos/tr1/stream.mp4'), durMs: 120000 });

    await d.setPlayed('m1', true);
    expect(api.setPlayed).toHaveBeenCalledWith('m1', true);

    await d.leaveToLibrary('m1', { type: 'Movie' });
    expect(leaveToLibrary).toHaveBeenCalledWith('m1', { type: 'Movie' });

    d.savePrefs({ style: 'flat', lastChannel: 4 });
    expect(localStorage.getItem('lfx.live.tvstyle.u1')).toBe('flat');
    expect(localStorage.getItem('lfx.live.lastChannel.u1')).toBe('4');

    d.openThemePicker();
    expect(openThemePicker).toHaveBeenCalled();
    d.logout();
    expect(logout).toHaveBeenCalled();
    d.openDashboard();
    expect(window.location.hash).toBe('#/dashboard');
  });

  it('loadTrailer: null ohne Trailer, null-sichere Dauer, Fehler -> null', async () => {
    const { loadLocalTrailer } = await import('../src/js/shared/trailer.js');
    await mountOk();
    const d = captured.deps;
    vi.mocked(loadLocalTrailer).mockResolvedValueOnce(null);
    expect(await d.loadTrailer('m1')).toBeNull();
    vi.mocked(loadLocalTrailer).mockResolvedValueOnce({ Id: 'tr2' });
    expect((await d.loadTrailer('m1')).durMs).toBeNull();
    vi.mocked(loadLocalTrailer).mockRejectedValueOnce(new Error('netz'));
    expect(await d.loadTrailer('m1')).toBeNull();
  });

  it('onProgress/onReady steuern die Ladeanzeige', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await mountOk();
    const root = document.getElementById('lfx-live-home');
    captured.deps.onProgress(0.5, 'Programm wird geplant …');
    expect(root.querySelector('.lfx-live-loading__label').textContent).toBe('Programm wird geplant …');
    captured.deps.onReady();
    expect(root.querySelector('.lfx-live-loading').classList.contains('is-done')).toBe(true);
    expect(captured.host.classList.contains('is-ready')).toBe(true);
    vi.advanceTimersByTime(500);
    expect(root.querySelector('.lfx-live-loading')).toBeNull();
  });
});

describe('Fallback', () => {
  it('Engine-Paket lädt nicht: Panel mit Aktionen, kein create()', async () => {
    vi.mocked(ensureThemeJs).mockResolvedValue(false);
    feature.mount(route());
    await vi.waitFor(() => expect(document.querySelector('.lfx-live-fallback')).not.toBeNull());
    expect(create).not.toHaveBeenCalled();
    const labels = [...document.querySelectorAll('.lfx-live-fallback__btn')].map((b) => b.textContent);
    expect(labels).toEqual(['Erneut versuchen', 'Design wechseln', 'Zu LENZ+', 'Abmelden']);
    expect(document.querySelector('.lfx-live-loading')).toBeNull();
    const btn = (t) => [...document.querySelectorAll('.lfx-live-fallback__btn')].find((b) => b.textContent === t);
    btn('Design wechseln').click();
    expect(openThemePicker).toHaveBeenCalled();
    btn('Zu LENZ+').click();
    expect(leaveToLibrary).toHaveBeenCalledWith(null);
    btn('Abmelden').click();
    expect(logout).toHaveBeenCalled();
  });

  it('„Erneut versuchen“ lädt neu und startet die Engine', async () => {
    vi.mocked(ensureThemeJs).mockResolvedValueOnce(false);
    feature.mount(route());
    await vi.waitFor(() => expect(document.querySelector('.lfx-live-fallback')).not.toBeNull());
    [...document.querySelectorAll('.lfx-live-fallback__btn')].find((b) => b.textContent === 'Erneut versuchen').click();
    expect(document.querySelector('.lfx-live-fallback')).toBeNull();
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  });

  it('Katalogfehler: Fallback mit geschwärztem Detail (api_key und ApiKey)', async () => {
    vi.mocked(loadCatalog).mockRejectedValueOnce(new Error('kaputt https://x/y?api_key=GEHEIM&ApiKey=AUCHGEHEIM'));
    feature.mount(route());
    await vi.waitFor(() => expect(document.querySelector('.lfx-live-fallback__detail')).not.toBeNull());
    const detail = document.querySelector('.lfx-live-fallback__detail').textContent;
    expect(detail).not.toContain('GEHEIM');
    expect(detail).toContain('api_key=…');
    expect(detail).toContain('ApiKey=…');
  });

  it('onFatal der Engine: Instanz verworfen, Fallback mit „Erneut versuchen“', async () => {
    await mountOk();
    captured.deps.onFatal(new Error('boom ApiKey=ABC'));
    expect(inst.dispose).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.lfx-live-fallback')).not.toBeNull();
    expect(document.querySelector('.lfx-live-fallback__detail').textContent).not.toContain('ABC');
    expect(document.querySelector('.lfx-live-fallback__btn--primary').textContent).toBe('Erneut versuchen');
  });

  it('Engine ohne create(): Fallback', async () => {
    window.LenzFlixLive = {};
    feature.mount(route());
    await vi.waitFor(() => expect(document.querySelector('.lfx-live-fallback')).not.toBeNull());
  });
});

describe('Lebenszyklus', () => {
  it('unmount: suspend + Dispose nach 3 min; Wiedereinstieg setzt fort (resume, kein create)', async () => {
    await mountOk();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    feature.unmount();
    expect(inst.suspend).toHaveBeenCalledTimes(1);
    expect(inst.dispose).not.toHaveBeenCalled();
    expect(document.getElementById('lfx-live-home')).toBeNull();
    expect(document.documentElement.classList.contains('lfx-live-home-on')).toBe(false);
    vi.advanceTimersByTime(SUSPEND_MS - 1000);
    expect(inst.dispose).not.toHaveBeenCalled();
    // Wiedereinstieg vor Ablauf
    feature.mount(route());
    await vi.waitFor(() => expect(inst.resume).toHaveBeenCalledTimes(1));
    expect(inst.resume.mock.calls[0][0].classList.contains('lfx-live-stage')).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(SUSPEND_MS * 2);
    expect(inst.dispose).not.toHaveBeenCalled(); // Timer wurde beim Fortsetzen gelöscht
  });

  it('dispose nach SUSPEND_MS ohne Wiedereinstieg', async () => {
    await mountOk();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    feature.unmount();
    vi.advanceTimersByTime(SUSPEND_MS);
    expect(inst.dispose).toHaveBeenCalledTimes(1);
  });

  it('Design-Wechsel weg von live: sofort dispose, nicht bei live', async () => {
    await mountOk();
    for (const fn of [...themeState.listeners]) fn({ theme: 'live', previous: 'live' });
    expect(inst.dispose).not.toHaveBeenCalled();
    feature.unmount();
    for (const fn of [...themeState.listeners]) fn({ theme: 'plus', previous: 'live' });
    expect(inst.dispose).toHaveBeenCalledTimes(1);
    expect(themeState.listeners.size).toBe(0);
  });

  it('destroyLive: dispose, DOM und Script-Tags weg', async () => {
    await mountOk();
    feature.unmount();
    destroyLive();
    expect(inst.dispose).toHaveBeenCalledTimes(1);
    expect(removeThemeJs).toHaveBeenCalled();
    expect(document.getElementById('lfx-live-home')).toBeNull();
    destroyLive(); // idempotent
    expect(inst.dispose).toHaveBeenCalledTimes(1);
  });

  it('unmount vor Abschluss des Ladens: keine Instanz, kein create()', async () => {
    let release;
    vi.mocked(ensureThemeJs).mockImplementationOnce(() => new Promise((r) => { release = r; }));
    feature.mount(route());
    await vi.waitFor(() => expect(ensureThemeJs).toHaveBeenCalled());
    feature.unmount();
    release(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(create).not.toHaveBeenCalled();
  });

  it('update: baut die Bühne nur neu, wenn sie fehlt', async () => {
    await mountOk();
    const first = document.getElementById('lfx-live-home');
    feature.update(route());
    expect(document.getElementById('lfx-live-home')).toBe(first);
  });
});
