// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const themeMock = vi.hoisted(() => ({ store: false }));
vi.mock('../src/js/core/theme.js', () => ({ isTheme: vi.fn((id) => id === 'store' && themeMock.store), getTheme: () => 'flix' }));

import feature from '../src/js/features/autonext.js';
import { features } from '../src/js/features/index.js';
import { startAutoNext, stopAutoNext } from '../src/js/autonext/autonext.js';

const UP = () => '<h2 class="upNextDialog-nextVideoText">x</h2><div class="flex upNextDialog-buttons"><button class="btnStartNow upNextDialog-button"></button><button class="btnHide upNextDialog-button"></button></div>';
const page = () => document.querySelector('[id="videoOsdPage"]:not(.hide)');
const up = () => page().querySelector('.upNextContainer');
const btns = () => document.querySelectorAll('.lfx-autonext');
const txt = () => document.querySelector('.lfx-autonext__text').textContent;
const show = () => { up().innerHTML = UP(); up().classList.remove('hide', 'upNextDialog-hidden'); };
const adv = (ms) => vi.advanceTimersByTime(ms);
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

describe('autonext', () => {
  let video;
  let vpaused = false;
  let click;
  beforeEach(() => {
    vi.useFakeTimers();
    themeMock.store = false;
    localStorage.clear();
    delete window.ApiClient;
    document.documentElement.className = 'lfx-js';
    document.body.innerHTML = '<video class="htmlvideoplayer"></video><div id="videoOsdPage" class="libraryPage"><div class="upNextContainer hide"></div></div>';
    video = document.querySelector('video');
    vpaused = false; // jsdom: paused ist sonst immer true
    Object.defineProperty(video, 'paused', { configurable: true, get: () => vpaused });
    click = vi.fn();
    startAutoNext();
  });
  afterEach(() => {
    stopAutoNext();
    if (window.__lfxAutoNext) window.__lfxAutoNext.destroy();
    vi.useRealTimers();
    document.documentElement.className = '';
  });
  const showAndHook = () => {
    show();
    adv(400);
    page().querySelector('.btnStartNow').addEventListener('click', click);
  };

  it('Feature registriert; match: nicht store', () => {
    expect(features.map((f) => f.name)).toContain('autonext');
    expect(feature.match()).toBe(true);
    themeMock.store = true;
    expect(feature.match()).toBe(false);
  });

  it('Knopf genau einmal nach .btnHide, Klassen ohne btnStartNow/btnHide', () => {
    show();
    adv(2000);
    expect(btns().length).toBe(1);
    const b = btns()[0];
    expect(b.previousElementSibling.classList.contains('btnHide')).toBe(true);
    expect(b.classList.contains('btnStartNow') || b.classList.contains('btnHide')).toBe(false);
    expect(b.getAttribute('aria-pressed')).toBe('true');
    expect(b.classList.contains('is-on')).toBe(true);
  });

  it('neu eingefügt nach innerHTML-Neuschreiben; Fokus bleibt', () => {
    show();
    adv(400);
    const s = page().querySelector('.btnStartNow');
    s.focus();
    adv(400);
    expect(document.activeElement).toBe(s);
    show();
    adv(400);
    expect(btns().length).toBe(1);
    expect(txt()).toBe('Weiter in 5');
  });

  it('nach 5 s genau ein Klick, Countdown-Text', () => {
    showAndHook();
    expect(txt()).toBe('Weiter in 5');
    expect(btns()[0].classList.contains('is-running')).toBe(true);
    adv(2000);
    expect(txt()).toBe('Weiter in 3');
    adv(3600);
    expect(click).toHaveBeenCalledTimes(1);
    adv(10000);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('kein Klick bei Verbergen, pause, Rücksprung, emptied, Seitenwechsel', () => {
    const cases = [
      () => up().classList.add('hide'),
      () => up().classList.add('upNextDialog-hidden'), // Ausblend-Transition vor .hide
      () => video.dispatchEvent(new Event('pause')),
      () => { video.currentTime = 0; video.dispatchEvent(new Event('seeking')); },
      () => video.dispatchEvent(new Event('emptied')),
      () => page().classList.add('hide'),
    ];
    for (const c of cases) {
      video.currentTime = 100;
      document.getElementById('videoOsdPage').classList.remove('hide');
      show();
      adv(400);
      const cl = vi.fn();
      page().querySelector('.btnStartNow').addEventListener('click', cl);
      adv(1000);
      c();
      adv(8000);
      expect(cl).not.toHaveBeenCalled();
      document.getElementById('videoOsdPage').classList.remove('hide');
      up().classList.add('hide');
      adv(400);
    }
  });

  it('Overlay erscheint bei pausiertem Video: Lauf wartet bis zur Wiedergabe', () => {
    vpaused = true;
    showAndHook();
    adv(8000);
    expect(click).not.toHaveBeenCalled();
    expect(txt()).toBe('Auto-Weiter: An');
    vpaused = false;
    adv(400);
    expect(txt()).toMatch(/^Weiter in /);
    adv(4400);
    expect(click).not.toHaveBeenCalled();
    adv(1000); // nächster Tick nach der Deadline
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('Rücksprung wird auch im Tick erkannt', () => {
    video.currentTime = 100;
    showAndHook();
    video.currentTime = 10;
    adv(8000);
    expect(click).not.toHaveBeenCalled();
    expect(txt()).toBe('Auto-Weiter: An');
  });

  it('Knopfdruck: An → Aus bricht ab und speichert; Aus → An startet neuen Lauf', () => {
    showAndHook();
    const b = btns()[0];
    const stop = vi.fn();
    document.body.addEventListener('click', stop);
    b.click();
    expect(stop).not.toHaveBeenCalled();
    expect(txt()).toBe('Auto-Weiter: Aus');
    expect(localStorage.getItem('lfx.autonext.anon')).toBe('0');
    adv(8000);
    expect(click).not.toHaveBeenCalled();
    b.click();
    expect(txt()).toBe('Weiter in 5');
    adv(5400);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('Aus gespeichert: kein Lauf beim Erscheinen', () => {
    stopAutoNext();
    localStorage.setItem('lfx.autonext.anon', '0');
    startAutoNext();
    showAndHook();
    adv(8000);
    expect(click).not.toHaveBeenCalled();
    expect(txt()).toBe('Auto-Weiter: Aus');
  });

  it('Store-Ausschluss: Klasse und #lfx-store-park', () => {
    document.documentElement.classList.add('lfx-theme-store');
    show();
    adv(8000);
    expect(btns().length).toBe(0);
    document.documentElement.classList.remove('lfx-theme-store');
    const park = document.createElement('div');
    park.id = 'lfx-store-park';
    document.body.appendChild(park);
    adv(1000);
    expect(btns().length).toBe(0);
  });

  it('Store-Prüfung unmittelbar vor dem Klick', () => {
    showAndHook();
    adv(4500);
    const park = document.createElement('div');
    park.id = 'lfx-store-park';
    document.body.appendChild(park);
    adv(2000);
    expect(click).not.toHaveBeenCalled();
  });

  it('Besitzer-Marker: zweiter Start No-op; destroy räumt ab', () => {
    expect(window.__lfxAutoNext).toBeTruthy();
    expect(startAutoNext()).toBe(false);
    show();
    adv(400);
    expect(btns().length).toBe(1);
    window.__lfxAutoNext.destroy();
    expect(window.__lfxAutoNext).toBeUndefined();
    expect(btns().length).toBe(0);
    expect(startAutoNext()).toBe(true);
  });

  it('fremder Besitzer: stopAutoNext räumt nichts', () => {
    stopAutoNext();
    const other = { version: 'x', destroy: vi.fn() };
    window.__lfxAutoNext = other;
    expect(startAutoNext()).toBe(false);
    stopAutoNext();
    expect(other.destroy).not.toHaveBeenCalled();
    delete window.__lfxAutoNext;
    startAutoNext();
  });

  describe('Speicherung', () => {
    const mkApi = (cp) => ({
      getCurrentUserId: () => 'u1',
      getDisplayPreferences: vi.fn(() => Promise.resolve({ Id: 'lenzflix-player', CustomPrefs: { ...cp } })),
      updateDisplayPreferences: vi.fn(() => Promise.resolve()),
    });
    it('Serverwert 0 wird geladen', async () => {
      window.ApiClient = mkApi({ autoNext: '0', other: 'x' });
      adv(400);
      await flush();
      show();
      adv(400);
      expect(txt()).toBe('Auto-Weiter: Aus');
      expect(window.ApiClient.getDisplayPreferences).toHaveBeenCalledWith('lenzflix-player', 'u1', 'lenzflix');
    });
    it('fehlend = An; ApiClient erst später verfügbar, kein Spam', async () => {
      show();
      adv(800);
      expect(txt()).toBe('Weiter in 5');
      window.ApiClient = mkApi({});
      adv(400);
      await flush();
      expect(window.ApiClient.getDisplayPreferences).toHaveBeenCalledTimes(1);
      adv(2000);
      await flush();
      expect(window.ApiClient.getDisplayPreferences).toHaveBeenCalledTimes(1);
    });
    it('Knopf: GET → POST behält andere CustomPrefs', async () => {
      window.ApiClient = mkApi({ other: 'x' });
      adv(400);
      await flush();
      show();
      adv(400);
      btns()[0].click();
      await flush();
      const u = window.ApiClient.updateDisplayPreferences;
      expect(u).toHaveBeenCalledTimes(1);
      const [id, body, uid, client] = u.mock.calls[0];
      expect([id, uid, client]).toEqual(['lenzflix-player', 'u1', 'lenzflix']);
      expect(body.CustomPrefs).toEqual({ other: 'x', autoNext: '0' });
      expect(localStorage.getItem('lfx.autonext.u1')).toBe('0');
    });
    it('Nutzerwahl gewinnt gegen laufenden GET', async () => {
      let res;
      window.ApiClient = mkApi({});
      window.ApiClient.getDisplayPreferences = vi.fn(() => new Promise((r) => { res = r; }));
      show();
      adv(400);
      btns()[0].click();
      res({ CustomPrefs: { autoNext: '1' } });
      await flush();
      expect(txt()).toBe('Auto-Weiter: Aus');
    });
  });
});
