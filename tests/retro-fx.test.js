// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({ isReady: vi.fn(() => true), getUserId: () => 'u1', getItems: vi.fn(async () => ({ Items: [] })) }));
vi.mock('../src/js/core/theme.js', () => ({
  isTheme: vi.fn(() => true),
  getTheme: () => 'retro',
  brandName: (id) => id.toUpperCase(),
  setTheme: vi.fn(async () => {}),
  THEMES: ['flix', 'plus', 'prime', 'retro'],
}));
vi.mock('../src/js/shared/libraries.js', () => ({ getLibraries: vi.fn(async () => []) }));
vi.mock('../src/js/shared/profile.js', () => ({ getUserChip: vi.fn(async () => ({ name: 'Lena', imageUrl: null })) }));
vi.mock('../src/js/shared/search.js', () => ({ searchItems: vi.fn(async () => ({ movies: [], series: [], episodes: [], people: [] })) }));

import { isTheme } from '../src/js/core/theme.js';
import { isReady } from '../src/js/core/api.js';
import { parseHash } from '../src/js/core/router.js';
import fx from '../src/js/features/retro/fx/index.js';
import { createSequence, createTapCounter, CHEAT_SEQUENCE } from '../src/js/features/retro/fx/cheat.js';
import { hasBooted, BOOT_FLAG, runBoot } from '../src/js/features/retro/fx/boot.js';
import { createScreensaver } from '../src/js/features/retro/fx/screensaver.js';
import { createSound } from '../src/js/features/retro/fx/sound.js';
import { setPref, emitFx, LOGO_ATTR, OVERDRIVE_CLASS, NO_CRT_CLASS } from '../src/js/features/retro/prefs.js';

const html = document.documentElement;
const route = (h) => parseHash(h);
const key = (k, extra = {}, target = document.body) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));
const pdown = (el, extra = {}) => el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, ...extra }));

function resetDom() {
  document.body.className = '';
  document.body.innerHTML = '<header class="MuiAppBar-root"></header>';
  html.className = 'lfx-js lfx-theme-retro';
  window.location.hash = '#/home';
}

beforeEach(() => {
  vi.useFakeTimers();
  resetDom();
  window.sessionStorage.clear();
  window.localStorage.clear();
  isTheme.mockReturnValue(true);
  isReady.mockReturnValue(true);
  window.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 16);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
});
afterEach(() => {
  fx.unmount();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('match', () => {
  it('nur im Retro-Design, Modern, nicht TV, eingeloggt', () => {
    expect(fx.match(route('#/home'))).toBe(true);
    isTheme.mockReturnValue(false);
    expect(fx.match(route('#/home'))).toBe(false);
    isTheme.mockReturnValue(true);
    html.classList.add('layout-tv');
    expect(fx.match(route('#/home'))).toBe(false);
    html.classList.remove('layout-tv');
    document.body.innerHTML = '';
    expect(fx.match(route('#/home'))).toBe(false); // kein Modern-Layout
    resetDom();
    isReady.mockReturnValue(false);
    expect(fx.match(route('#/home'))).toBe(false);
  });

  it('nicht im Player und nicht auf der Dashboard-Seite', () => {
    expect(fx.match(route('#/video'))).toBe(false);
    document.body.insertAdjacentHTML('beforeend', '<div id="videoOsdPage"></div>');
    expect(fx.match(route('#/home'))).toBe(false);
    document.getElementById('videoOsdPage').classList.add('hide');
    expect(fx.match(route('#/home'))).toBe(true);
    document.body.classList.add('dashboardDocument');
    expect(fx.match(route('#/home'))).toBe(false);
  });
});

describe('mount / unmount', () => {
  it('mount legt CRT an, unmount räumt alles auf (DOM, Klassen, Timer, Listener)', async () => {
    window.sessionStorage.setItem(BOOT_FLAG, '1');
    const base = vi.getTimerCount();
    fx.mount(route('#/home'));
    expect(document.getElementById('lfx-retro-crt')).toBeTruthy();
    fx.unmount();
    expect(document.getElementById('lfx-retro-crt')).toBeNull();
    expect(document.getElementById('lfx-retro-terminal')).toBeNull();
    expect(html.classList.contains(NO_CRT_CLASS)).toBe(false);
    expect(vi.getTimerCount()).toBe(base);
    // Listener weg: Backquote öffnet nichts mehr
    key('`', { code: 'Backquote' });
    await vi.advanceTimersByTimeAsync(50);
    expect(document.getElementById('lfx-retro-terminal')).toBeNull();
  });

  it('unmount mitten im Boot entfernt Overlay und Timer', () => {
    const base = vi.getTimerCount();
    fx.mount(route('#/home'));
    expect(document.getElementById('lfx-retro-boot')).toBeTruthy();
    fx.unmount();
    expect(document.getElementById('lfx-retro-boot')).toBeNull();
    expect(vi.getTimerCount()).toBeLessThanOrEqual(base + 1); // +1: jsdom-internes Storage-Ereignis (sessionStorage.setItem)
  });

  it('unmount mitten im Overdrive entfernt Klasse, Toast und Timer', () => {
    window.sessionStorage.setItem(BOOT_FLAG, '1');
    const base = vi.getTimerCount();
    fx.mount(route('#/home'));
    for (const k of CHEAT_SEQUENCE) key(k);
    expect(html.classList.contains(OVERDRIVE_CLASS)).toBe(true);
    fx.unmount();
    expect(html.classList.contains(OVERDRIVE_CLASS)).toBe(false);
    expect(document.getElementById('lfx-retro-od-toast')).toBeNull();
    expect(vi.getTimerCount()).toBe(base);
  });

  it('CRT aus: kein Overlay, NO_CRT_CLASS; Vorliebe wirkt live', () => {
    window.sessionStorage.setItem(BOOT_FLAG, '1');
    setPref('crt', false);
    fx.mount(route('#/home'));
    expect(document.getElementById('lfx-retro-crt')).toBeNull();
    expect(html.classList.contains(NO_CRT_CLASS)).toBe(true);
    setPref('crt', true);
    expect(document.getElementById('lfx-retro-crt')).toBeTruthy();
    expect(html.classList.contains(NO_CRT_CLASS)).toBe(false);
  });
});

describe('Boot-Screen', () => {
  it('nur einmal pro Sitzung', () => {
    fx.mount(route('#/home'));
    expect(document.getElementById('lfx-retro-boot')).toBeTruthy();
    expect(hasBooted()).toBe(true);
    fx.unmount();
    fx.mount(route('#/home'));
    expect(document.getElementById('lfx-retro-boot')).toBeNull();
  });

  it('läuft ab (<= 3,5 s) und verschwindet', async () => {
    fx.mount(route('#/home'));
    await vi.advanceTimersByTimeAsync(1800);
    expect(document.querySelector('.lfx-retro-boot__text').textContent).toContain('LENZ//84 BIOS');
    await vi.advanceTimersByTimeAsync(1700);
    expect(document.getElementById('lfx-retro-boot')).toBeNull();
  });

  it('überspringbar per Taste und Klick', async () => {
    fx.mount(route('#/home'));
    await vi.advanceTimersByTimeAsync(300);
    key('x');
    expect(document.getElementById('lfx-retro-boot').classList.contains('is-open')).toBe(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(document.getElementById('lfx-retro-boot')).toBeNull();
    fx.unmount();
    window.sessionStorage.clear();
    fx.mount(route('#/home'));
    pdown(document.body);
    await vi.advanceTimersByTimeAsync(500);
    expect(document.getElementById('lfx-retro-boot')).toBeNull();
  });

  it('harter Timeout: Overlay verschwindet immer', async () => {
    const onDone = vi.fn();
    runBoot({ getName: () => new Promise(() => {}), onDone }); // Name hängt ewig
    expect(document.getElementById('lfx-retro-boot')).toBeTruthy();
    await vi.advanceTimersByTimeAsync(4600);
    expect(document.getElementById('lfx-retro-boot')).toBeNull();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('reduced-motion: kurze Version (~0,8 s)', async () => {
    const onDone = vi.fn();
    runBoot({ reduced: true, onDone });
    expect(document.querySelector('.lfx-retro-boot__text').textContent).toContain('BEREIT.');
    await vi.advanceTimersByTimeAsync(900);
    expect(onDone).toHaveBeenCalled();
    expect(document.getElementById('lfx-retro-boot')).toBeNull();
  });
});

describe('Cheat-Code', () => {
  it('Sequenz-Erkennung inkl. falscher Folge und Groß-/Kleinschreibung', () => {
    const s = createSequence();
    const feed = (arr) => arr.map((k) => s.feed(k)).pop();
    expect(feed([...CHEAT_SEQUENCE.slice(0, 8), 'b', 'a'])).toBe(true);
    expect(feed([...CHEAT_SEQUENCE.slice(0, 8), 'B', 'A'])).toBe(true);
    expect(feed([...CHEAT_SEQUENCE.slice(0, 8), 'a', 'b'])).toBe(false);
    // Vorlauf mit Fehleingaben davor ist egal
    expect(feed(['x', 'ArrowUp', ...CHEAT_SEQUENCE])).toBe(true);
    // extra ArrowUp vorab
    expect(feed(['ArrowUp', ...CHEAT_SEQUENCE])).toBe(true);
  });

  it('Overdrive per Tastatur: Klasse, Toast, endet nach 20 s', async () => {
    window.sessionStorage.setItem(BOOT_FLAG, '1');
    fx.mount(route('#/home'));
    for (const k of CHEAT_SEQUENCE) key(k);
    expect(html.classList.contains(OVERDRIVE_CLASS)).toBe(true);
    expect(document.getElementById('lfx-retro-od-toast').textContent).toBe('>> OVERDRIVE AKTIVIERT <<');
    await vi.advanceTimersByTimeAsync(20100);
    expect(html.classList.contains(OVERDRIVE_CLASS)).toBe(false);
    expect(document.getElementById('lfx-retro-od-toast')).toBeNull();
  });

  it('Eingabefeld wird ignoriert, Pfeiltasten werden nie verhindert', () => {
    window.sessionStorage.setItem(BOOT_FLAG, '1');
    document.body.insertAdjacentHTML('beforeend', '<input id="q">');
    fx.mount(route('#/home'));
    const input = document.getElementById('q');
    for (const k of CHEAT_SEQUENCE) key(k, {}, input);
    expect(html.classList.contains(OVERDRIVE_CLASS)).toBe(false);
    const ev = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });
    document.body.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it('Tipp-Zähler: 7 schnelle Tipps, Pause setzt zurück', () => {
    const t = createTapCounter({ gap: 400 });
    expect([1, 2, 3].map((i) => t.tap(i * 100))).toEqual([1, 2, 3]);
    expect(t.tap(2000)).toBe(1);
  });

  it('7x schnelles Tippen auf ein Logo löst Overdrive aus; 1 Tipp lässt Navigation zu', () => {
    window.sessionStorage.setItem(BOOT_FLAG, '1');
    document.body.insertAdjacentHTML('beforeend', `<a id="logo" href="#/home" ${LOGO_ATTR}>L</a>`);
    fx.mount(route('#/home'));
    const logo = document.getElementById('logo');
    const click = () => { const c = new MouseEvent('click', { bubbles: true, cancelable: true }); logo.dispatchEvent(c); return c.defaultPrevented; };
    pdown(logo);
    expect(click()).toBe(false); // erster Tipp: normale Navigation
    for (let i = 0; i < 5; i++) { vi.advanceTimersByTime(100); pdown(logo); expect(click()).toBe(true); }
    expect(html.classList.contains(OVERDRIVE_CLASS)).toBe(false);
    vi.advanceTimersByTime(100);
    pdown(logo);
    expect(html.classList.contains(OVERDRIVE_CLASS)).toBe(true);
    expect(click()).toBe(true); // 7. Tipp: Link-Navigation verhindert
  });
});

describe('Sound', () => {
  it('Standard aus; ohne AudioContext in jsdom kein Fehler', () => {
    const snd = createSound(() => false);
    expect(snd.play('click')).toBe(false);
    expect(snd.unlock()).toBe(false);
    const on = createSound(() => true);
    expect(() => { on.unlock(); on.play('boot'); on.suspend(); on.startRain(); }).not.toThrow();
    expect(on.isRunning()).toBe(false);
  });

  it('FX_EVENT ohne Sound wirft nicht', () => {
    window.sessionStorage.setItem(BOOT_FLAG, '1');
    fx.mount(route('#/home'));
    expect(() => { emitFx('hover'); emitFx('click'); emitFx('error'); setPref('sound', true); setPref('sound', false); }).not.toThrow();
  });
});

describe('Bildschirmschoner', () => {
  const stubCanvas = () => {
    const ctx = { fillRect: vi.fn(), fillText: vi.fn(), fillStyle: '', font: '', textBaseline: '' };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
    return ctx;
  };

  it('startet nach 3 min ohne Eingabe und endet bei Eingabe (Klick wird geschluckt)', async () => {
    stubCanvas();
    const ss = createScreensaver({});
    ss.start();
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    expect(ss.isActive()).toBe(false);
    await vi.advanceTimersByTimeAsync(65 * 1000);
    expect(ss.isActive()).toBe(true);
    expect(document.getElementById('lfx-retro-rain')).toBeTruthy();
    const pageClick = vi.fn();
    document.body.addEventListener('click', pageClick);
    pdown(document.body);
    expect(ss.isActive()).toBe(false);
    expect(document.getElementById('lfx-retro-rain')).toBeNull();
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(pageClick).not.toHaveBeenCalled();
    ss.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('Eingabe setzt den Leerlauf zurück; blockiert bei Dialog/Video nicht gestartet', async () => {
    stubCanvas();
    let blocked = true;
    const ss = createScreensaver({ isBlocked: () => blocked });
    ss.start();
    await vi.advanceTimersByTimeAsync(3.5 * 60 * 1000);
    expect(ss.isActive()).toBe(false);
    blocked = false;
    await vi.advanceTimersByTimeAsync(30 * 1000);
    expect(ss.isActive()).toBe(true);
    ss.stop();
  });

  it('getContext null: kein Fehler, kein Overlay', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const ss = createScreensaver({});
    expect(ss.run()).toBe(false);
    expect(ss.isActive()).toBe(false);
    expect(document.getElementById('lfx-retro-rain')).toBeNull();
    ss.stop();
  });

  it('reduced-motion: kein Auto-Start, aber manuell möglich', async () => {
    stubCanvas();
    const ss = createScreensaver({ reduced: true });
    ss.start();
    await vi.advanceTimersByTimeAsync(4 * 60 * 1000);
    expect(ss.isActive()).toBe(false);
    expect(ss.run()).toBe(true);
    ss.stop();
    expect(document.getElementById('lfx-retro-rain')).toBeNull();
  });
});

describe('Terminal-Hotkey', () => {
  it('Backquote öffnet/Esc schließt; nicht im Eingabefeld und nicht bei Dialog', async () => {
    window.sessionStorage.setItem(BOOT_FLAG, '1');
    document.body.insertAdjacentHTML('beforeend', '<input id="q">');
    fx.mount(route('#/home'));
    key('`', { code: 'Backquote' }, document.getElementById('q'));
    expect(document.getElementById('lfx-retro-terminal')).toBeNull();
    document.body.insertAdjacentHTML('beforeend', '<div class="dialogContainer"><div class="dialog"></div></div>');
    key('`', { code: 'Backquote' });
    expect(document.getElementById('lfx-retro-terminal')).toBeNull();
    document.querySelector('.dialogContainer').remove();
    key('`', { code: 'Backquote' });
    await vi.advanceTimersByTimeAsync(50);
    const term = document.getElementById('lfx-retro-terminal');
    expect(term).toBeTruthy();
    expect(document.activeElement).toBe(term.querySelector('input'));
    key('Escape', {}, term.querySelector('input'));
    await vi.advanceTimersByTimeAsync(400);
    expect(document.getElementById('lfx-retro-terminal')).toBeNull();
  });
});
