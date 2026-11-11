// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const themeState = vi.hoisted(() => ({ listeners: new Set() }));

vi.mock('../src/js/core/theme.js', () => ({
  isTheme: vi.fn((id) => id === 'store'),
  onThemeChange: vi.fn((fn) => {
    themeState.listeners.add(fn);
    return () => themeState.listeners.delete(fn);
  }),
  setTheme: vi.fn(async () => {}),
}));
vi.mock('../src/js/core/api.js', async () => {
  const actual = await vi.importActual('../src/js/core/api.js');
  return { ...actual, isReady: () => true, getUserId: () => 'u1', getUser: vi.fn(async () => ({ Name: 'Lenz' })) };
});
vi.mock('../src/js/core/themejs.js', () => ({ ensureThemeJs: vi.fn(async () => true), removeThemeJs: vi.fn() }));
vi.mock('../src/js/core/themepicker.js', () => ({ openThemePicker: vi.fn() }));
vi.mock('../src/js/core/playback.js', () => ({ play: vi.fn(async () => true) }));
vi.mock('../src/js/features/store/data.js', () => ({ loadCatalog: vi.fn(async () => ({ items: new Map(), departments: [], resume: [], favorites: [], highlights: [] })) }));
vi.mock('../src/js/shared/profile.js', () => ({
  getUserChip: vi.fn(async () => ({ name: 'Lenz', imageUrl: null })),
  profileEntries: vi.fn(async () => []),
  logout: vi.fn(),
}));

import feature, { SUSPEND_MS, destroyStore } from '../src/js/features/store/home.js';
import { storeHomeRoute } from '../src/js/features/store/home-route.js';
import { ensureThemeJs } from '../src/js/core/themejs.js';
import { loadCatalog } from '../src/js/features/store/data.js';
import { isTheme, setTheme } from '../src/js/core/theme.js';

const route = (q = '') => ({ path: '/home', params: new URLSearchParams(q), hash: `/home${q ? `?${q}` : ''}` });
const tick = () => new Promise((r) => setTimeout(r, 0));
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
  sessionStorage.clear();
  localStorage.clear();
  themeState.listeners.clear();
  inst = { suspend: vi.fn(), resume: vi.fn(), dispose: vi.fn(), openItem: vi.fn(), openTerminal: vi.fn() };
  captured = null;
  create = vi.fn((host, deps, opts) => {
    captured = { host, deps, opts };
    return inst;
  });
  window.LenzFlixStore3D = { version: 1, create };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({ getExtension: () => null }));
  vi.mocked(isTheme).mockImplementation((id) => id === 'store');
  vi.mocked(ensureThemeJs).mockResolvedValue(true);
});
afterEach(() => {
  vi.useRealTimers();
  feature.unmount();
  destroyStore();
  vi.restoreAllMocks();
  delete window.LenzFlixStore3D;
  delete window.__lfxStoreDebug;
});

describe('Routen', () => {
  it('storeHomeRoute: Startseite, new, title, search; nicht classic/hub/tab=1', () => {
    expect(storeHomeRoute(route())).toEqual({ kind: 'home', id: null, q: null });
    expect(storeHomeRoute(route('lfx=new'))).toEqual({ kind: 'home', id: null, q: null });
    expect(storeHomeRoute(route('lfx=title&id=a1'))).toEqual({ kind: 'title', id: 'a1', q: null });
    expect(storeHomeRoute(route('lfx=title'))).toBeNull();
    expect(storeHomeRoute(route('lfx=search&q=alien'))).toEqual({ kind: 'search', id: null, q: 'alien' });
    expect(storeHomeRoute(route('lfx=search'))).toEqual({ kind: 'search', id: null, q: '' });
    expect(storeHomeRoute(route('lfx=classic'))).toBeNull();
    expect(storeHomeRoute(route('lfx=hub&lib=1'))).toBeNull();
    expect(storeHomeRoute(route('tab=1'))).toBeNull();
    expect(storeHomeRoute({ path: '/movies', params: new URLSearchParams() })).toBeNull();
  });

  it('match: nur im Design store, Modern, passende Route', () => {
    expect(feature.match(route())).toBe(true);
    expect(feature.match(route('lfx=classic'))).toBe(false);
    vi.mocked(isTheme).mockImplementation(() => false);
    expect(feature.match(route())).toBe(false);
  });
});

describe('mount', () => {
  it('baut Bühne als erstes Kind von #homeTab und ruft create() mit deps/opts', async () => {
    await mountOk();
    const tab = document.getElementById('homeTab');
    expect(tab.firstElementChild.id).toBe('lfx-store-home');
    expect(captured.host.classList.contains('lfx-store-stage')).toBe(true);
    expect(tab.firstElementChild.contains(captured.host)).toBe(true);
    expect(document.documentElement.classList.contains('lfx-store-home-on')).toBe(true);
    expect(captured.opts).toEqual({
      quality: 'auto', sound: false, showFps: false, bigCovers: true, skipIntro: false, restore: null, openItemId: null, openTerminal: false, query: '', phone: false, touch: false, debug: false,
    });
    for (const k of ['catalog', 'user', 'imageUrl', 'getItem', 'getSeasons', 'getEpisodes', 'setFavorite', 'setPlayed', 'search', 'loadTrailer', 'play', 'toast',
      'classicView', 'openLibraries', 'openMenu', 'openSettings', 'openThemePicker', 'logout', 'onProgress', 'onReady', 'onState', 'onPrefs', 'onBigCovers', 'onFatal']) {
      expect(captured.deps[k]).toBeDefined();
    }
    expect(captured.deps.user).toEqual({ name: 'Lenz' });
    expect(loadCatalog).toHaveBeenCalled();
    expect(sessionStorage.getItem('lfx.store.introSeen')).toBe('1');
  });

  it('opts: Intro schon gesehen, gespeicherter Zustand, Route title/search, Debug', async () => {
    sessionStorage.setItem('lfx.store.introSeen', '1');
    sessionStorage.setItem('lfx.store.state', JSON.stringify({ x: 1, z: 2, yaw: 0.5, pitch: 0, heldId: 'h' }));
    localStorage.setItem('lfx.store.quality.u1', 'low');
    localStorage.setItem('lfx.store.sound.u1', '1');
    window.__lfxStoreDebug = true;
    await mountOk('lfx=title&id=a1');
    expect(captured.opts).toMatchObject({
      quality: 'low', sound: true, skipIntro: true, restore: { x: 1, z: 2, yaw: 0.5, pitch: 0, heldId: 'h' }, openItemId: 'a1', debug: true,
    });
    feature.unmount();
    destroyStore();
    create.mockClear();
    await mountOk('lfx=search&q=alien');
    expect(captured.opts).toMatchObject({ openTerminal: true, query: 'alien', openItemId: null });
  });

  it('Fortschritt, Bereit und Rückmeldungen (State/Prefs) an die Hülle', async () => {
    await mountOk();
    const root = document.getElementById('lfx-store-home');
    captured.deps.onProgress(0.5, 'Regale …');
    expect(root.querySelector('.lfx-store-loading__label').textContent).toBe('Regale …');
    expect(root.querySelector('.lfx-store-tape__fill').style.width).toBe('50%');
    captured.deps.onState({ x: 3, z: 4, yaw: 1, pitch: 0, heldId: null });
    expect(JSON.parse(sessionStorage.getItem('lfx.store.state')).x).toBe(3);
    captured.deps.onPrefs({ quality: 'high', sound: true });
    expect(localStorage.getItem('lfx.store.quality.u1')).toBe('high');
    expect(localStorage.getItem('lfx.store.sound.u1')).toBe('1');
    captured.deps.onReady();
    expect(root.querySelector('.lfx-store-loading').classList.contains('is-done')).toBe(true);
    expect(root.querySelector('.lfx-store-btn--search').disabled).toBe(false);
  });

  it('HUD: Suche öffnet Terminal, Klassische Ansicht setzt die Route', async () => {
    await mountOk();
    expect(document.querySelector('.lfx-store-btn--search').disabled).toBe(true);
    captured.deps.onReady();
    document.querySelector('.lfx-store-btn--search').click();
    expect(inst.openTerminal).toHaveBeenCalledWith('');
    document.querySelector('.lfx-store-btn--classic').click();
    expect(window.location.hash).toBe('#/home?lfx=classic');
  });
});

describe('Hüllengröße', () => {
  it('Prefs: fps Standard aus, bigCovers Standard an, onPrefs speichert beide', async () => {
    await mountOk();
    expect(captured.opts.showFps).toBe(false);
    expect(captured.opts.bigCovers).toBe(true);
    captured.deps.onPrefs({ quality: 'auto', sound: false, fps: true, bigCovers: false });
    expect(localStorage.getItem('lfx.store.fps.u1')).toBe('1');
    expect(localStorage.getItem('lfx.store.bigCovers.u1')).toBe('0');
    feature.unmount();
    destroyStore();
    create.mockClear();
    await mountOk();
    expect(captured.opts).toMatchObject({ showFps: true, bigCovers: false });
  });

  it('onBigCovers: dispose, Ladebildschirm, neues create mit bigCovers:false, ohne Intro und mit Position', async () => {
    await mountOk();
    captured.deps.onState({ x: 3, z: 4, yaw: 1, pitch: 0, heldId: 'h' });
    captured.deps.onReady();
    const first = inst;
    const second = { suspend: vi.fn(), resume: vi.fn(), dispose: vi.fn(), openItem: vi.fn(), openTerminal: vi.fn() };
    create.mockImplementationOnce((host, deps, opts) => { captured = { host, deps, opts }; return second; });
    captured.deps.onBigCovers(false);
    expect(localStorage.getItem('lfx.store.bigCovers.u1')).toBe('0');
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(captured.opts).toMatchObject({ bigCovers: false, skipIntro: true, restore: { x: 3, z: 4, heldId: 'h' } });
    expect(document.querySelector('.lfx-store-loading')).not.toBeNull();
    expect(document.querySelectorAll('#lfx-store-home').length).toBe(1);
    expect(second.dispose).not.toHaveBeenCalled();
  });

  it('onBigCovers nach unmount baut nichts neu auf', async () => {
    await mountOk();
    const { deps } = captured;
    feature.unmount();
    deps.onBigCovers(false);
    await tick();
    await tick();
    expect(create).toHaveBeenCalledTimes(1);
    expect(inst.dispose).not.toHaveBeenCalled();
  });
});

describe('Lebenszyklus', () => {
  it('unmount -> suspend; erneuter mount -> resume ohne neues create und ohne Ladebildschirm', async () => {
    await mountOk();
    feature.unmount();
    expect(inst.suspend).toHaveBeenCalledTimes(1);
    expect(inst.dispose).not.toHaveBeenCalled();
    expect(document.getElementById('lfx-store-home')).toBeNull();
    expect(document.documentElement.classList.contains('lfx-store-home-on')).toBe(false);
    feature.mount(route());
    expect(create).toHaveBeenCalledTimes(1);
    expect(inst.resume).toHaveBeenCalledTimes(1);
    const stage = inst.resume.mock.calls[0][0];
    expect(stage.classList.contains('lfx-store-stage')).toBe(true);
    expect(stage).not.toBe(captured.host);
    expect(document.querySelector('.lfx-store-loading')).toBeNull();
  });

  it('nach 3 Minuten suspendiert -> dispose; danach neues create', async () => {
    await mountOk();
    vi.useFakeTimers();
    feature.unmount();
    vi.advanceTimersByTime(SUSPEND_MS - 1);
    expect(inst.dispose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(inst.dispose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    feature.mount(route());
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(2));
  });

  it('resume vor Ablauf bricht den dispose-Timer ab', async () => {
    await mountOk();
    vi.useFakeTimers();
    feature.unmount();
    vi.advanceTimersByTime(SUSPEND_MS - 1000);
    feature.mount(route());
    vi.advanceTimersByTime(5000);
    expect(inst.dispose).not.toHaveBeenCalled();
  });

  it('Design-Wechsel weg von store -> sofort dispose (auch suspendiert)', async () => {
    await mountOk();
    feature.unmount();
    for (const fn of [...themeState.listeners]) fn({ theme: 'flix', previous: 'store' });
    expect(inst.dispose).toHaveBeenCalledTimes(1);
    expect(themeState.listeners.size).toBe(0);
  });

  it('destroyStore -> dispose und Bühne weg', async () => {
    await mountOk();
    destroyStore();
    expect(inst.dispose).toHaveBeenCalledTimes(1);
    expect(document.getElementById('lfx-store-home')).toBeNull();
  });

  it('update: title -> openItem, search -> openTerminal; gleiche Route tut nichts', async () => {
    await mountOk();
    feature.update(route());
    expect(inst.openItem).not.toHaveBeenCalled();
    feature.update(route('lfx=title&id=zz'));
    expect(inst.openItem).toHaveBeenCalledWith('zz');
    feature.update(route('lfx=title&id=zz'));
    expect(inst.openItem).toHaveBeenCalledTimes(1);
    feature.update(route('lfx=search&q=abc'));
    expect(inst.openTerminal).toHaveBeenCalledWith('abc');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('wird während des Ladens verlassen: kein create', async () => {
    let release;
    vi.mocked(ensureThemeJs).mockReturnValue(new Promise((r) => { release = r; }));
    feature.mount(route());
    await tick();
    feature.unmount();
    release(true);
    await tick();
    await tick();
    expect(create).not.toHaveBeenCalled();
  });
});

describe('Fallback', () => {
  it('ohne WebGL: Panel mit Text und Knöpfen, kein create', async () => {
    HTMLCanvasElement.prototype.getContext.mockImplementation(() => null);
    feature.mount(route());
    await vi.waitFor(() => expect(document.querySelector('.lfx-store-fallback')).not.toBeNull());
    expect(document.querySelector('.lfx-store-fallback').textContent).toContain('Dein Browser kann die 3D-Videothek nicht darstellen.');
    expect(create).not.toHaveBeenCalled();
    const btns = [...document.querySelectorAll('.lfx-store-fallback__btn')].map((b) => b.textContent);
    expect(btns).toEqual(['Zu LENZFLIX wechseln', 'Klassische Ansicht']);
    document.querySelector('.lfx-store-fallback__btn').click();
    expect(setTheme).toHaveBeenCalledWith('flix', { source: 'user' });
  });

  it('Bundle lädt nicht: Panel mit „Erneut versuchen“, Wiederholung startet create', async () => {
    vi.mocked(ensureThemeJs).mockResolvedValueOnce(false);
    feature.mount(route());
    await vi.waitFor(() => expect(document.querySelector('.lfx-store-fallback')).not.toBeNull());
    const again = [...document.querySelectorAll('.lfx-store-fallback__btn')].find((b) => b.textContent === 'Erneut versuchen');
    expect(again).toBeTruthy();
    again.click();
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(document.querySelector('.lfx-store-fallback')).toBeNull();
  });

  it('onFatal -> Fallback mit Fehlertext, Instanz wird verworfen', async () => {
    await mountOk();
    captured.deps.onFatal(new Error('WebGL-Kontext verloren'));
    const panel = document.querySelector('.lfx-store-fallback');
    expect(panel.textContent).toContain('Die 3D-Videothek konnte nicht gestartet werden.');
    expect(panel.textContent).toContain('WebGL-Kontext verloren');
    expect(inst.dispose).toHaveBeenCalledTimes(1);
  });

  it('onFatal noch während create(): Instanz wird nicht behalten', async () => {
    create.mockImplementation((host, deps) => {
      deps.onFatal(new Error('kein WebGL2'));
      return inst;
    });
    feature.mount(route());
    await vi.waitFor(() => expect(inst.dispose).toHaveBeenCalled());
    expect(document.querySelector('.lfx-store-fallback')).not.toBeNull();
    feature.unmount();
    expect(inst.suspend).not.toHaveBeenCalled();
  });
});
