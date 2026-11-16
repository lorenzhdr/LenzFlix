// @vitest-environment jsdom
// Welle 3 (Hülle der Videothek): Benutzerwechsel, Katalog-Cache, Rückkehr zu ladender Instanz, ersetzter #homeTab,
// späte #homeTab, Routenwechsel beim Laden, Schlüsselschwärzung.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const st = vi.hoisted(() => ({ uid: 'uA', gate: null }));

vi.mock('../src/js/core/theme.js', () => ({
  isTheme: vi.fn((id) => id === 'store'),
  onThemeChange: vi.fn(() => () => {}),
  setTheme: vi.fn(async () => {}),
}));
vi.mock('../src/js/core/api.js', async () => {
  const actual = await vi.importActual('../src/js/core/api.js');
  return { ...actual, isReady: () => true, getUserId: () => st.uid, getUser: vi.fn(async () => ({ Name: st.uid })) };
});
vi.mock('../src/js/core/themejs.js', () => ({ ensureThemeJs: vi.fn(async () => true), removeThemeJs: vi.fn() }));
vi.mock('../src/js/core/themepicker.js', () => ({ openThemePicker: vi.fn() }));
vi.mock('../src/js/core/playback.js', () => ({ play: vi.fn(async () => true) }));
vi.mock('../src/js/features/store/data.js', () => ({
  loadCatalog: vi.fn(async () => {
    if (st.gate) await st.gate;
    return { items: new Map(), departments: [], resume: [], favorites: [], highlights: [] };
  }),
}));
vi.mock('../src/js/shared/profile.js', () => ({
  getUserChip: vi.fn(async () => ({ name: 'x', imageUrl: null })),
  profileEntries: vi.fn(async () => []),
  logout: vi.fn(),
}));

import { cached } from '../src/js/core/cache.js';
import feature, { destroyStore } from '../src/js/features/store/home.js';

const route = (hash = '/home') => {
  const qi = hash.indexOf('?');
  return { path: qi < 0 ? hash : hash.slice(0, qi), params: new URLSearchParams(qi < 0 ? '' : hash.slice(qi + 1)), hash };
};
const TAB = '<div id="indexPage"><div id="homeTab"><div class="sections"></div></div></div>';
let inst;
let create;
let cap;

// Instanz-Attrappe wie store3d: resume() tut ohne vorheriges suspend() nichts, hängt sonst den Host um.
function makeInst() {
  const o = {
    suspended: false,
    host: null,
    suspend: vi.fn(() => { o.suspended = true; }),
    resume: vi.fn((host) => { if (!o.suspended) return; o.suspended = false; if (host) o.host = host; }),
    dispose: vi.fn(),
    openItem: vi.fn(),
    openTerminal: vi.fn(),
  };
  return o;
}

beforeEach(() => {
  st.uid = 'uA';
  st.gate = null;
  window.location.hash = '#/home';
  document.body.innerHTML = `<header class="MuiAppBar-root"></header>${TAB}`;
  sessionStorage.clear();
  localStorage.clear();
  inst = makeInst();
  create = vi.fn((stage, deps) => { cap = deps; inst.host = stage; return inst; });
  window.LenzFlixStore3D = { version: 1, create };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({ getExtension: () => null }));
});
afterEach(() => {
  feature.unmount();
  destroyStore();
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete window.LenzFlixStore3D;
});

const booted = async () => {
  await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  await new Promise((r) => setTimeout(r, 0));
};

describe('Welle 3 Videothek-Hülle', () => {
  it('B054: Instanz von A wird für B nicht fortgesetzt, sondern verworfen', async () => {
    feature.mount(route());
    await booted();
    feature.unmount();
    expect(inst.suspend).toHaveBeenCalled();
    st.uid = 'uB';
    feature.mount(route());
    await new Promise((r) => setTimeout(r, 20));
    expect(inst.resume).not.toHaveBeenCalled();
    expect(inst.dispose).toHaveBeenCalled();
  });

  it('B058: lfx:play leert den Katalog-Cache', async () => {
    feature.mount(route());
    await booted();
    await cached('store:catalog:uA', async () => 'alt', 60000);
    window.dispatchEvent(new Event('lfx:play'));
    expect(await cached('store:catalog:uA', async () => 'neu', 60000)).toBe('neu');
  });

  it('A101: Rückkehr zu noch ladender Instanz behält den Ladebildschirm', async () => {
    feature.mount(route());
    await booted();
    feature.unmount();
    feature.mount(route());
    await vi.waitFor(() => expect(inst.resume).toHaveBeenCalled());
    expect(document.querySelector('.lfx-store-loading')).not.toBeNull();
    expect(document.querySelector('.lfx-store-stage').classList.contains('is-ready')).toBe(false);
    cap.onReady();
    expect(document.querySelector('.lfx-store-stage').classList.contains('is-ready')).toBe(true);
  });

  it('B053: ersetzter #homeTab bei laufender Instanz bekommt den Host', async () => {
    feature.mount(route());
    await booted();
    document.body.innerHTML = `<header class="MuiAppBar-root"></header>${TAB}`;
    feature.update(route());
    await new Promise((r) => setTimeout(r, 20));
    const stage = document.querySelector('.lfx-store-stage');
    expect(stage).not.toBeNull();
    expect(inst.host).toBe(stage);
  });

  it('B056: spät erscheinender #homeTab wird bei update() mit gleicher Route eingehängt', async () => {
    document.body.innerHTML = '<header class="MuiAppBar-root"></header>';
    vi.useFakeTimers();
    feature.mount(route());
    await vi.advanceTimersByTimeAsync(7000);
    document.body.insertAdjacentHTML('beforeend', TAB);
    feature.update(route());
    expect(document.getElementById('lfx-store-home')).not.toBeNull();
  });

  it('B057: Routenwechsel während des Ladens wird nach dem Laden angewendet', async () => {
    let open;
    st.gate = new Promise((r) => { open = r; });
    feature.mount(route());
    await new Promise((r) => setTimeout(r, 10));
    window.location.hash = '#/home?lfx=search&q=abc';
    feature.update(route('/home?lfx=search&q=abc'));
    open();
    await booted();
    expect(inst.openTerminal).toHaveBeenCalledWith('abc');
  });

  it('A098: Fehlertext schwärzt auch ApiKey', async () => {
    create.mockImplementation(() => { throw new Error('GET /x?ApiKey=geheim123&a=1 fehlgeschlagen'); });
    feature.mount(route());
    await vi.waitFor(() => expect(document.querySelector('.lfx-store-fallback__detail')).not.toBeNull());
    expect(document.querySelector('.lfx-store-fallback__detail').textContent).not.toContain('geheim123');
  });
});
