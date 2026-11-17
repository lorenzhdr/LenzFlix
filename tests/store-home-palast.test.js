// @vitest-environment jsdom
// Hülle: 2D-Kino im LENZ PALAST (deps.onCinema2d): Bühne sichtbar parken, „Zurück ins Kino“, Rückkehr, Aufräumen.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const themeState = vi.hoisted(() => ({ listeners: new Set() }));

vi.mock('../src/js/core/theme.js', () => ({
  isTheme: vi.fn((id) => id === 'store'),
  onThemeChange: vi.fn((fn) => { themeState.listeners.add(fn); return () => themeState.listeners.delete(fn); }),
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
import { play } from '../src/js/core/playback.js';
import { isTheme } from '../src/js/core/theme.js';

const route = (q = '') => ({ path: '/home', params: new URLSearchParams(q), hash: `/home${q ? `?${q}` : ''}` });
let inst;
let create;
let captured;
const html = () => document.documentElement.classList;

async function mountOk() {
  feature.mount(route());
  await vi.waitFor(() => expect(create).toHaveBeenCalled());
  captured.deps.onReady();
}

beforeEach(() => {
  document.body.innerHTML = '<header class="MuiAppBar-root"></header><div id="indexPage"><div id="homeTab"><div class="sections"></div></div></div>';
  sessionStorage.clear();
  localStorage.clear();
  themeState.listeners.clear();
  inst = { suspend: vi.fn(), resume: vi.fn(), dispose: vi.fn(), openItem: vi.fn(), openTerminal: vi.fn(), isXr: vi.fn(() => false), leaveCinema: vi.fn(), cinema2dSetFull: vi.fn() };
  create = vi.fn((host, deps, opts) => { captured = { host, deps, opts }; return inst; });
  window.LenzFlixStore3D = { version: 1, create };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({ getExtension: () => null }));
  vi.mocked(isTheme).mockImplementation((id) => id === 'store');
});
afterEach(() => {
  vi.useRealTimers();
  feature.unmount();
  destroyStore();
  vi.restoreAllMocks();
  delete window.LenzFlixStore3D;
});

describe('Hülle · 2D-Kino im Palast', () => {
  it('(a) onCinema2d({active}) aktiviert die Bridge und setzt die <html>-Klasse; Ende schaltet beides ab', async () => {
    await mountOk();
    const act = vi.spyOn(captured.deps.cinema, 'activate');
    captured.deps.onCinema2d({ active: true, full: false });
    expect(act).toHaveBeenLastCalledWith(true);
    expect(html().contains('lfx-store-palast')).toBe(true);
    expect(html().contains('lfx-store-palast-full')).toBe(false);
    captured.deps.onCinema2d({ active: false, full: false });
    expect(act).toHaveBeenLastCalledWith(false);
    expect(html().contains('lfx-store-palast')).toBe(false);
  });

  it('(b) unmount parkt die Bühne sichtbar: ohne suspend, ohne 3-min-Timer, ohne Clipping', async () => {
    await mountOk();
    const stage = captured.host;
    captured.deps.onCinema2d({ active: true, full: false });
    vi.useFakeTimers();
    feature.unmount();
    const box = document.getElementById('lfx-store-park');
    expect(box).not.toBeNull();
    expect(box.contains(stage)).toBe(true);
    expect(box.style.opacity).toBe('');
    expect(box.style.zIndex).toBe('');
    expect(box.style.position).toBe('');
    expect(inst.suspend).not.toHaveBeenCalled();
    vi.advanceTimersByTime(SUSPEND_MS * 2);
    expect(inst.dispose).not.toHaveBeenCalled();
  });

  it('(c) mount bei geparkter Bühne und aktivem Kino: Bühne zurück, kein resume, leaveCinema(home)', async () => {
    await mountOk();
    const stage = captured.host;
    captured.deps.onCinema2d({ active: true, full: false });
    feature.unmount();
    feature.mount(route());
    const home = document.getElementById('lfx-store-home');
    expect(home.contains(stage)).toBe(true);
    expect(document.getElementById('lfx-store-park')).toBeNull();
    expect(inst.resume).not.toHaveBeenCalled();
    expect(inst.suspend).not.toHaveBeenCalled();
    expect(inst.leaveCinema).toHaveBeenCalledWith('home');
  });

  it('(d)(e) Vollbild zeigt „Zurück ins Kino“; Klick ruft cinema2dSetFull(false); ohne full entfernt', async () => {
    await mountOk();
    captured.deps.onCinema2d({ active: true, full: false });
    expect(document.querySelector('.lfx-palast-back')).toBeNull();
    captured.deps.onCinema2d({ active: true, full: true });
    const b = document.querySelector('.lfx-palast-back');
    expect(b).not.toBeNull();
    expect(b.textContent).toBe('Zurück ins Kino');
    expect(html().contains('lfx-store-palast-full')).toBe(true);
    captured.deps.onCinema2d({ active: true, full: true });
    expect(document.querySelectorAll('.lfx-palast-back')).toHaveLength(1);
    b.click();
    expect(inst.cinema2dSetFull).toHaveBeenCalledWith(false);
    captured.deps.onCinema2d({ active: true, full: false });
    expect(document.querySelector('.lfx-palast-back')).toBeNull();
    expect(html().contains('lfx-store-palast-full')).toBe(false);
  });

  it('Knopf blendet sich nach 3 s aus und kehrt bei Bewegung zurück', async () => {
    await mountOk();
    vi.useFakeTimers();
    captured.deps.onCinema2d({ active: true, full: true });
    const b = document.querySelector('.lfx-palast-back');
    expect(b.classList.contains('is-idle')).toBe(false);
    vi.advanceTimersByTime(3100);
    expect(b.classList.contains('is-idle')).toBe(true);
    window.dispatchEvent(new Event('mousemove'));
    expect(b.classList.contains('is-idle')).toBe(false);
  });

  it('(f) ohne aktives Kino bleibt unmount wie bisher: suspend + 3-min-Timer, kein Park-Container', async () => {
    await mountOk();
    vi.useFakeTimers();
    feature.unmount();
    expect(inst.suspend).toHaveBeenCalledTimes(1);
    expect(document.getElementById('lfx-store-park')).toBeNull();
    vi.advanceTimersByTime(SUSPEND_MS + 1);
    expect(inst.dispose).toHaveBeenCalledTimes(1);
  });

  it('Kino endet bei geparkter Bühne (Selbst-Verlassen): wie Zeile 4, suspend und Timer', async () => {
    await mountOk();
    captured.deps.onCinema2d({ active: true, full: false });
    feature.unmount();
    vi.useFakeTimers();
    captured.deps.onCinema2d({ active: false, full: false });
    expect(inst.suspend).toHaveBeenCalledTimes(1);
    expect(document.getElementById('lfx-store-park')).toBeNull();
    vi.advanceTimersByTime(SUSPEND_MS + 1);
    expect(inst.dispose).toHaveBeenCalledTimes(1);
  });

  it('(g) destroyStore räumt Knopf, Klassen und Park-Container', async () => {
    await mountOk();
    captured.deps.onCinema2d({ active: true, full: true });
    feature.unmount();
    expect(document.getElementById('lfx-store-park')).not.toBeNull();
    destroyStore();
    expect(document.getElementById('lfx-store-park')).toBeNull();
    expect(document.querySelector('.lfx-palast-back')).toBeNull();
    expect(html().contains('lfx-store-palast')).toBe(false);
    expect(html().contains('lfx-store-palast-full')).toBe(false);
  });

  it('Design-Wechsel räumt das Kino auf', async () => {
    await mountOk();
    captured.deps.onCinema2d({ active: true, full: true });
    for (const fn of themeState.listeners) fn({ theme: 'flix' });
    expect(inst.dispose).toHaveBeenCalled();
    expect(document.querySelector('.lfx-palast-back')).toBeNull();
    expect(html().contains('lfx-store-palast')).toBe(false);
  });

  it('deps.play reicht noCover nur bei Bedarf durch (Default unverändert)', async () => {
    await mountOk();
    await captured.deps.play({ Id: 'a' }, { resume: true });
    expect(play).toHaveBeenLastCalledWith({ Id: 'a' }, { resume: true });
    await captured.deps.play({ Id: 'a' });
    expect(play).toHaveBeenLastCalledWith({ Id: 'a' }, { resume: false });
    await captured.deps.play({ Id: 'a' }, { noCover: true });
    expect(play).toHaveBeenLastCalledWith({ Id: 'a' }, { resume: false, noCover: true });
  });

  it('XR-Ende während des 2D-Kinos schaltet die Bridge nicht ab', async () => {
    await mountOk();
    const act = vi.spyOn(captured.deps.cinema, 'activate');
    captured.deps.onCinema2d({ active: true, full: false });
    act.mockClear();
    captured.deps.onXr({ presenting: false, cinema: false });
    expect(act).not.toHaveBeenCalledWith(false);
  });
});
